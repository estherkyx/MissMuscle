import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import worker from '../server';
import { EXERCISES } from '../shared/exercises';
import { LiveCoachContextSchema, LiveInspectionResultSchema, type ExerciseId } from '../shared/contracts';
import { createLiveSession } from '../server/live/create-session';
import { LiveExercise } from '../src/features/live/LiveExercise';
import { CRITERIA, createCuePolicy, mergeFindings, retainCorrections } from '../src/features/live/findings';
import { coachingCueText } from '../src/features/live/coaching-cue';

const targets: Record<ExerciseId,string> = { dumbbell_curl:'neutral_wrist',lat_pulldown:'even_grip_pull',leg_extension:'full_extension',dumbbell_front_squat:'squat_depth' };
const frames=[0,0.9,1.8,2.7].map(timestampSec=>({timestampSec,width:1,height:1,dataUrl:'data:image/jpeg;base64,/9j/2Q=='}));
const post=(body:unknown)=>new Request('http://localhost/api/live/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

for(const exercise of EXERCISES) test(`${exercise.id}: live route, correction cues, replay and voice use selected criteria`,async t=>{
  const target=exercise.criteria.find(criterion=>criterion.id===targets[exercise.id])!;
  const indices=exercise.id==='dumbbell_curl'?[3]:exercise.id==='lat_pulldown'?[0,3]:[0,2,3];
  const draft={summary:'Synthetic exercise-specific correction.',visibility:{assessable:true,limitations:[]},
    formChecks:exercise.criteria.map(criterion=>({criterionId:criterion.id,status:criterion===target?'needs_attention':'unclear',
      note:criterion===target?target.cue:'Synthetic visibility limitation.',evidence:criterion===target?indices.map(frameIndex=>({frameIndex})):[]}))};
  let invalid=false;
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{
    const body=JSON.parse(init.body as string);
    if(body.transport) {
      assert.equal(body.session.model,'gpt-live-1');
      assert.equal(body.session.delegation.responses.model,'gpt-6-astra');
      assert.ok(body.session.instructions.includes(exercise.label));
      assert.deepEqual(body.session.delegation.responses.tools,[]);
      return Response.json({session:{id:'test-session'},transport:{type:'webrtc',sdp:'test-answer'}});
    }
    assert.equal(body.model,'gpt-6-astra');
    assert.ok(body.instructions.includes(exercise.variation));
    assert.ok(body.instructions.includes(target.deviation));
    const schema=body.text.format.schema.properties.formChecks;
    assert.equal(schema.minItems,exercise.criteria.length);
    assert.deepEqual(schema.items.properties.criterionId.enum,exercise.criteria.map(criterion=>criterion.id));
    assert.ok(schema.items.properties.evidence.maxItems>=indices.length);
    const output=structuredClone(draft);
    if(invalid) output.formChecks.find(check=>check.criterionId===target.id)!.evidence.pop();
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]});
  });
  const input={window:{sessionId:'session',windowId:exercise.id,startSec:20,request:{clipId:exercise.id,exerciseId:exercise.id,durationSec:2.7,frames}}};
  const response=await worker.fetch(post(input),{OPENAI_API_KEY:'test-only'});
  assert.equal(response.status,200);
  const result=LiveInspectionResultSchema.parse(await response.json());
  assert.equal(result.report.exerciseId,exercise.id);
  assert.equal(result.report.formChecks!.length,exercise.criteria.length);
  assert.deepEqual(result.report.targetMuscles,exercise.targetMuscles);
  assert.equal(result.report.corrections[0].cue,target.cue);
  assert.deepEqual(result.report.corrections[0].evidence.map(e=>e.timestampSec),indices.map(index=>frames[index].timestampSec));
  const findings=mergeFindings([],result);
  assert.equal(findings.length,1);assert.equal(CRITERIA[findings[0].criterionId],target.title);
  const policy=createCuePolicy(),cue=policy.select(findings,23,false)!;
  assert.ok(coachingCueText(cue,exercise.id).includes(target.cue));policy.spoken(cue,23);
  assert.ok(coachingCueText(policy.select(findings,29,false)!,exercise.id).includes(target.cue));
  const recording={id:'test-recording',startSec:20,endSec:23,segments:[{id:'segment',startSec:20,endSec:23,blob:new Blob(['test']),ready:Promise.resolve()}]};
  const saved=retainCorrections([],result,recording,frames);
  assert.equal(saved[0].criterionId,target.id);assert.equal(saved[0].evidence.length,indices.length);
  const context={mode:'live' as const,guidanceOnly:true,sessionId:'session',exerciseId:exercise.id,elapsedSec:23,latest:result};
  assert.ok(LiveCoachContextSchema.safeParse(context).success);
  const other=EXERCISES.find(item=>item.id!==exercise.id)!;
  assert.equal(LiveCoachContextSchema.safeParse({...context,exerciseId:other.id}).success,false);
  await createLiveSession({sdpOffer:'test-offer',context},{OPENAI_API_KEY:'test-only'});
  invalid=true;
  const rejected=await worker.fetch(post(input),{OPENAI_API_KEY:'test-only'});
  assert.equal(rejected.status,502,'missing supporting evidence must not become a live correction');
  assert.equal((await rejected.json()).error.code,'INVALID_MODEL_OUTPUT');
});

test('all four live views expose the right name, setup and looping reference',()=>{
  for(const exercise of EXERCISES) {
    const html=renderToStaticMarkup(createElement(LiveExercise,{exerciseId:exercise.id,visible:true}));
    assert.ok(html.includes(exercise.label));
    assert.ok(html.includes(exercise.label+' reference form animation'));
    assert.ok(html.includes('LOOPING EXAMPLE'));
    assert.ok(html.includes('Start session'));
    assert.ok(!html.includes('Session performance'));
    if(exercise.id!=='dumbbell_curl')assert.ok(!html.includes('dumbbell curl'));
  }
});
