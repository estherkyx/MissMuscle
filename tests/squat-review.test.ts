import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRepEvidence } from '../src/features/live/rep-evidence';
import { createRepActivity } from '../src/features/live/rep-activity';
import { CameraFrames } from '../src/features/live/recording';
import { referenceSpatialPose, projectReferencePoint } from '../src/features/video/reference-spatial';
import { referenceExercisePose } from '../src/features/video/exercise-pose';
import { buildLiveAnalysisInstructions, buildAnalysisInstructions } from '../server/analysis/rubric';

test('squat review selects real descent, deepest point and return even when uniform sampling misses the bottom',()=>{
  const frames=Array.from({length:18},(_,index)=>({time:index*0.4,id:index}));
  const chosen=selectRepEvidence(frames,{startSec:0.8,peakSec:3.2,returnSec:6.4})!;
  assert.ok(chosen.length<=4);
  assert.equal(chosen[0],frames[2]);assert.equal(chosen.at(-1),frames[16]);
  assert.ok(chosen.includes(frames[8]));
  assert.ok(chosen.every(frame=>frames.includes(frame)),'no inferred image or timestamp');
  assert.equal(selectRepEvidence(frames.filter(frame=>Math.abs(frame.time-3.2)>0.4),{startSec:0.8,peakSec:3.2,returnSec:6.4}),null,'no substitute bottom when the actual camera evidence is missing');
});

for (const exerciseId of ['dumbbell_front_squat', 'leg_extension'] as const) test(`${exerciseId}: small partial reps still create review candidates without grading range locally`,()=>{
  const tracker=createRepActivity(exerciseId);
  for(let frame=0;frame<=40;frame++) {
    const progress=(frame<=20?frame/20:(40-frame)/20)*0.12;
    tracker.update([referenceExercisePose(exerciseId,progress)],300,400,frame/10);
  }
  assert.ok(tracker.latestRep,'a small excursion and return must not be filtered out as no rep');
  assert.ok(Math.abs(tracker.latestRep.peakSec-2)<0.2);
  assert.ok(tracker.latestRep.startSec<tracker.latestRep.peakSec);
  assert.ok(tracker.latestRep.returnSec>tracker.latestRep.peakSec);
});

for (const exerciseId of ['dumbbell_front_squat', 'leg_extension'] as const) test(`${exerciseId}: camera windows retain the endpoint through a wait, with unchanged evidence clocks`,t=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,
    getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,/9j/2Q=='})}});
  t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else Reflect.deleteProperty(globalThis,'document');});
  const frames=new CameraFrames(),video={readyState:2,videoWidth:640,videoHeight:480} as HTMLVideoElement;
  for(let i=0;i<=16;i++)frames.capture(video,i*0.4);
  frames.retainRep({startSec:0.8,peakSec:3.2,returnSec:6.4});
  for(let i=17;i<=25;i++)frames.capture(video,i*0.4);
  const result=frames.snapshot('session',10,exerciseId);
  assert.equal(result.startSec,0.8);
  const times=result.request.frames.map(frame=>result.startSec+frame.timestampSec);
  assert.ok(times.some(time=>Math.abs(time-3.2)<1e-9));
  assert.equal(times.at(-1),6.4);
  assert.ok(result.request.frames.length<=4);
  const next=frames.snapshot('session',10,exerciseId);
  assert.ok(next.startSec>=7,'do not continually resubmit the same earlier rep');
  frames.retainRep({startSec:9.8,peakSec:10,returnSec:10.1});
  assert.ok(frames.snapshot('session',10,exerciseId).startSec>=7,'incomplete new timing cannot reuse old rep frames');
  frames.clear();assert.throws(()=>frames.snapshot('session',10,exerciseId));
});

test('depth review requires a turnaround for praise as well as corrections, including with substitute equipment',()=>{
  for(const instructions of [buildLiveAnalysisInstructions('dumbbell_front_squat'),buildAnalysisInstructions('dumbbell_front_squat')]) {
    assert.match(instructions,/Standing after a rep is not evidence of adequate depth/);
    assert.match(instructions,/small knee bend with hip lowering and a return to standing is a partial squat attempt/);
    assert.match(instructions,/do not automatically mark it unclear just because the view is frontal/);
    assert.match(instructions,/hips staying high should get a depth correction/);
    assert.match(instructions,/explicitly say depth was not confirmed/);
    assert.match(instructions,/Both looks_consistent and needs_attention for squat_depth require three/);
    assert.match(instructions,/Accepted equipment substitutes do not relax/);
  }
});


test('extension review requires the actual endpoint for praise and corrections, including practice reps',()=>{
  for(const instructions of [buildLiveAnalysisInstructions('leg_extension'),buildAnalysisInstructions('leg_extension')]) {
    assert.match(instructions,/Both looks_consistent and needs_attention for full_extension require at least three/);
    assert.match(instructions,/A partial lift and return still counts as a leg-extension attempt/);
    assert.match(instructions,/knee remains clearly bent at the visible turnaround, mark full_extension needs_attention/);
    assert.match(instructions,/Smooth movement or a raised shin does not establish full extension/);
    assert.match(instructions,/include the short-range correction in the summary and next-rep guidance/);
    assert.match(instructions,/Accepted equipment substitutes do not relax/);
  }
});

test('leg-extension endpoint capture ignores stationary tracking noise and a lift without a return',()=>{
  const tracker=createRepActivity('leg_extension');
  for(let frame=0;frame<30;frame++) {
    tracker.update([referenceExercisePose('leg_extension',0.2+(frame%2)*0.02)],300,400,frame/10);
  }
  assert.equal(tracker.latestRep,undefined);
  for(let frame=0;frame<=20;frame++) {
    tracker.update([referenceExercisePose('leg_extension',0.2+frame*0.02)],300,400,3+frame/10);
  }
  assert.equal(tracker.latestRep,undefined,'a bent knee during an unfinished lift is not a shortened rep');
});


// Synthetic geometry deliberately projects the knees directly onto the hips and
// ankles: their screen angle stays straight despite visible hip lowering.
for (const maximum of [0.2, 0.35, 1]) test(`frontal squat at reference progress ${maximum}: retains descent, turnaround and ascent on either visible side`,()=>{
  for (const side of [0, 1]) {
    const tracker=createRepActivity('dumbbell_front_squat');
    for(let frame=0;frame<=60;frame++) {
      const progress=(frame<=30?frame/30:(60-frame)/30)*maximum;
      const pose=referenceSpatialPose('dumbbell_front_squat',progress).map((point,index)=>({
        ...projectReferencePoint(point,0),visibility:[11,23,25,27].map(i=>i+1-side).includes(index)?0:point.visibility,
      }));
      tracker.update([pose],300,400,frame/10);
    }
    assert.ok(tracker.latestRep,'front-facing hip lowering must nominate a review despite a straight projected knee');
    assert.ok(Math.abs(tracker.latestRep.peakSec-3)<=0.2);
    assert.ok(tracker.latestRep.startSec<2);
    assert.ok(tracker.latestRep.returnSec>3.5);
  }
});

test('frontal squat timing ignores a torso bow, camera translation and stationary noise',()=>{
  for(const movement of ['bow','translation','noise'] as const) {
    const tracker=createRepActivity('dumbbell_front_squat');
    for(let frame=0;frame<=120;frame++) {
      const cycle=frame%60,progress=cycle<=30?cycle/30:(60-cycle)/30;
      const pose=referenceSpatialPose('dumbbell_front_squat',0).map((p,index)=>{
        const point=projectReferencePoint(p,0);
        if(movement==='bow'&&(index===11||index===12))point.y+=progress*0.03;
        if(movement==='translation')point.y+=progress*0.03;
        if(movement==='noise'&&(index===23||index===24))point.y+=(frame%2)*0.002;
        return point;
      });
      tracker.update([pose],300,400,frame/10);
    }
    assert.equal(tracker.latestRep,undefined,movement+' alone must not create a squat review');
  }
});
