import type { ExerciseId } from '../../../shared/contracts';
import type { ExerciseMotion } from './exercise-motion';
import type { FilteredPose } from './pose-filter';
import type { ReferenceView } from './reference-view';

export type ReferenceSample = { time: number; value: number | null; body: FilteredPose; view: ReferenceView | null; multiple: boolean };
type Span = { start: number; end: number; from: number; to: number; low: number; high: number };
export type ReferenceTimeline = { exerciseId: ExerciseId; samples: ReferenceSample[]; spans: Span[] };
const REVERSAL = 6*Math.PI/180;
const MIN_MOVEMENT = 0.25;
const HOLD = 0.2;
const PLATEAU = 0.5*Math.PI/180;
const EPS = 1e-7;

// These thresholds detect timing, never grade a person's range of motion.
export function buildReferenceTimeline(exerciseId: ExerciseId, input: ReferenceSample[]): ReferenceTimeline {
  const samples=input.map((sample,i)=>{
    const neighbors=input.slice(Math.max(0,i-1),i+2);
    const values=neighbors.map(s=>s.value);
    const continuous=neighbors.every((s,j)=>!j||s.time-neighbors[j-1].time<=0.15);
    const value=sample.value!==null&&values.every(v=>v!==null)&&continuous
      ? (values as number[]).sort((a,b)=>a-b)[Math.floor(values.length/2)] : sample.value;
    return {...sample,value};
  });
  const spans: Span[]=[];
  type Turn = { first: number; last: number; value: number };
  function process(run: ReferenceSample[]) {
    if(run.length<4) return;
    const turns: Turn[]=[];
    let candidate: Turn={first:0,last:0,value:run[0].value!};
    let direction=0;
    for(let i=1;i<run.length;i++) {
      const value=run[i].value!,delta=value-candidate.value;
      if(Math.abs(delta)<PLATEAU) { candidate.last=i; continue; }
      if(!direction) {
        if(Math.abs(delta)<REVERSAL) continue;
        // A held start is bounded; a clip starting mid-movement is not.
        if(run[candidate.last].time-run[candidate.first].time>=HOLD-EPS) turns.push(candidate);
        direction=Math.sign(delta);candidate={first:i,last:i,value};continue;
      }
      if(delta*direction>0) { candidate={first:i,last:i,value};continue; }
      if(Math.abs(delta)>=REVERSAL) {
        turns.push(candidate);direction=-direction;candidate={first:i,last:i,value};
      }
    }
    if(direction&&run[candidate.last].time-run[candidate.first].time>=HOLD-EPS) turns.push(candidate);
    for(let i=1;i<turns.length;i++) {
      const a=turns[i-1],b=turns[i];
      const start=run[a.last].time,end=run[b.first].time;
      if(end-start<MIN_MOVEMENT-EPS||Math.abs(b.value-a.value)<REVERSAL) continue;
      const from=b.value>a.value?0:1,to=1-from;
      const low=Math.min(a.value,b.value),high=Math.max(a.value,b.value);
      spans.push({start:run[a.first].time,end:start,from,to:from,low,high});
      spans.push({start,end,from,to,low,high});
      spans.push({start:end,end:run[b.last].time,from:to,to,low,high});
    }
  }
  let run: ReferenceSample[]=[];
  for(const sample of samples) {
    if(sample.value===null||!Number.isFinite(sample.value)||sample.multiple||
      (run.length&&sample.time-run[run.length-1].time>0.15)) {
      process(run);run=[];
    }
    if(sample.value!==null&&Number.isFinite(sample.value)&&!sample.multiple) run.push(sample);
  }
  process(run);
  return {exerciseId,samples,spans};
}

export function referenceAt(timeline: ReferenceTimeline,time: number): { body: FilteredPose; view: ReferenceView | null; motion: ExerciseMotion | null; multiple: boolean } {
  const empty={body:{joints:[]},view:null,motion:null,multiple:false};
  const samples=timeline.samples;
  if(!Number.isFinite(time)||!samples.length||time<samples[0].time||time>samples[samples.length-1].time+0.1) return empty;
  let lo=0,hi=samples.length-1;
  while(lo<hi) { const mid=Math.ceil((lo+hi)/2);if(samples[mid].time<=time)lo=mid;else hi=mid-1; }
  const a=samples[lo],b=samples[Math.min(lo+1,samples.length-1)];
  const t=a===b?0:Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time)));
  // Interpolate accepted adjacent observations only; never fill hidden limbs.
  const body={torsoSize:a.body.torsoSize,joints:a.body.joints.map((p,i)=>{
    const q=b.body.joints[i];
    return q&&!p.uncertain&&!q.uncertain&&(p.visibility??0)>=0.75&&(q.visibility??0)>=0.75
      ? {...p,x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t} : p;
  })};
  let view=a.view;
  if(view&&b.view) { const delta=Math.atan2(Math.sin(b.view.yaw-view.yaw),Math.cos(b.view.yaw-view.yaw));view={yaw:view.yaw+delta*t,held:view.held||b.view.held}; }
  const span=timeline.spans.find(s=>time>=s.start-EPS&&time<=s.end+EPS);
  let motion: ExerciseMotion|null=null;
  if(span&&a.value!==null&&(t===0||b.value!==null)&&!a.multiple) {
    const value=a.value+((b.value??a.value)-a.value)*t;
    const progress=span.from===span.to?span.from:Math.max(0,Math.min(1,(value-span.low)/(span.high-span.low)));
    const labels=timeline.exerciseId==='dumbbell_curl'?['Lifting','Lowering']:timeline.exerciseId==='lat_pulldown'?['Pulling','Returning']:timeline.exerciseId==='leg_extension'?['Extending','Returning']:['Lowering','Standing'];
    const holding=span.from===span.to||Math.abs((b.value??a.value)-a.value)<EPS;
    motion={time,progress,direction:holding?'Holding':labels[span.to>span.from?0:1]};
  }
  return {body:a.multiple?{joints:[]}:body,view:a.multiple?null:view,motion,multiple:a.multiple};
}
