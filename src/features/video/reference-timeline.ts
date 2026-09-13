import type { ExerciseId } from '../../../shared/contracts';
import type { ExerciseMotion } from './exercise-motion';
import type { FilteredPose } from './pose-filter';
import type { ReferenceView } from './reference-view';
import { bridgeBodyGaps, interpolateBody } from './body-timeline';

export type ReferenceSample = { time: number; value: number | null; body: FilteredPose; view: ReferenceView | null; multiple: boolean; inferred?: boolean };
type Span = { start: number; end: number; from: number; to: number; low: number; high: number; inferred: boolean };
export type ReferenceTimeline = { exerciseId: ExerciseId; samples: ReferenceSample[]; spans: Span[] };
const REVERSAL = 6*Math.PI/180;
const MIN_MOVEMENT = 0.25;
const HOLD = 0.2;
const PLATEAU = 0.5*Math.PI/180;
const EPS = 1e-7;

// These thresholds detect timing, never grade a person's range of motion.
export function buildReferenceTimeline(exerciseId: ExerciseId, input: ReferenceSample[]): ReferenceTimeline {
  const prepared=bridgeBodyGaps(input);
  // Bridge brief timing gaps only when both neighboring observations exist.
  let previous=-1;
  for(let i=0;i<prepared.length;i++) {
    if(prepared[i].multiple || (i>0 && prepared[i].time-prepared[i-1].time>0.15)) previous=-1;
    if(prepared[i].multiple || prepared[i].value===null || !Number.isFinite(prepared[i].value)) continue;
    if(previous>=0 && i>previous+1 && prepared[i].time-prepared[previous].time<=0.6+EPS) {
      const a=prepared[previous],b=prepared[i];
      for(let k=previous+1;k<i;k++) {
        const t=(prepared[k].time-a.time)/(b.time-a.time);
        prepared[k]={...prepared[k],value:a.value!+(b.value!-a.value!)*t,inferred:true};
      }
    }
    previous=i;
  }
  const samples=prepared.map((sample,i)=>{
    const neighbors=prepared.slice(Math.max(0,i-1),i+2);
    const values=neighbors.map(s=>s.value);
    const continuous=neighbors.every((s,j)=>!j||s.time-neighbors[j-1].time<=0.15);
    const value=sample.value!==null&&values.every(v=>v!==null)&&continuous
      ? (values as number[]).sort((a,b)=>a-b)[Math.floor(values.length/2)] : sample.value;
    return {...sample,value};
  });
  const spans: Span[]=[];
  type Turn = { first: number; last: number; value: number; inferred?: boolean };
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
        // Even a clip starting mid-lift supplies a useful movement direction.
        turns.push({...candidate,inferred:run[candidate.last].time-run[candidate.first].time<HOLD-EPS});
        direction=Math.sign(delta);candidate={first:i,last:i,value};continue;
      }
      if(delta*direction>0) { candidate={first:i,last:i,value};continue; }
      if(Math.abs(delta)>=REVERSAL) {
        turns.push(candidate);direction=-direction;candidate={first:i,last:i,value};
      }
    }
    if(direction) turns.push({...candidate,inferred:run[candidate.last].time-run[candidate.first].time<HOLD-EPS});
    for(let i=1;i<turns.length;i++) {
      const a=turns[i-1],b=turns[i];
      const start=run[a.last].time,end=run[b.first].time;
      if(end-start<MIN_MOVEMENT-EPS||Math.abs(b.value-a.value)<REVERSAL) continue;
      const from=b.value>a.value?0:1,to=1-from;
      const low=Math.min(a.value,b.value),high=Math.max(a.value,b.value);
      const inferred=!!a.inferred||!!b.inferred||run.slice(a.first,b.last+1).some(s=>s.inferred);
      spans.push({start:run[a.first].time,end:start,from,to:from,low,high,inferred});
      spans.push({start,end,from,to,low,high,inferred});
      spans.push({start:end,end:run[b.last].time,from:to,to,low,high,inferred});
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
  const body=interpolateBody(samples,lo,t);
  let view=a.view;
  if(view&&b.view) { const delta=Math.atan2(Math.sin(b.view.yaw-view.yaw),Math.cos(b.view.yaw-view.yaw));view={yaw:view.yaw+delta*t,held:view.held||b.view.held}; }
  const span=timeline.spans.find(s=>time>=s.start-EPS&&time<=s.end+EPS);
  let motion: ExerciseMotion|null=null;
  if(span&&a.value!==null&&(t===0||b.value!==null)&&!a.multiple) {
    const phase=span.end===span.start?0:Math.max(0,Math.min(1,(time-span.start)/(span.end-span.start)));
    const eased=phase*phase*(3-2*phase);
    const progress=span.from+(span.to-span.from)*eased;
    const labels=timeline.exerciseId==='dumbbell_curl'?['Lifting','Lowering']:timeline.exerciseId==='lat_pulldown'?['Pulling','Returning']:timeline.exerciseId==='leg_extension'?['Extending','Returning']:['Lowering','Standing'];
    const holding=span.from===span.to;
    motion={time,progress,direction:holding?'Holding':labels[span.to>span.from?0:1],inferred:span.inferred};
  }
  if(!motion&&!a.multiple) {
    const past=timeline.spans.filter(s=>s.end<=time).at(-1);
    const next=timeline.spans.find(s=>s.start>time);
    const radians=timeline.exerciseId==='dumbbell_curl'?135*Math.PI/180:timeline.exerciseId==='lat_pulldown'?Math.PI:Math.PI/2;
    const restingValue=samples.find(s=>!s.multiple&&s.value!==null)?.value??null;
    const progress=past?.to??next?.from??(restingValue===null?null:Math.max(0,Math.min(1,restingValue/radians)));
    if(progress!==null) motion={time,progress,direction:'Holding',inferred:true};
  }
  return {body:a.multiple?{joints:[]}:body,view:a.multiple?null:view,motion,multiple:a.multiple};
}
