import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReferenceTimeline, referenceAt, type ReferenceSample } from './reference-timeline';
import { referenceSpatialPose, referenceEquipment } from './reference-spatial';
import type { SpatialJoint } from './reference-view';
import { scanTimes } from './reference-scan';

const ids=['dumbbell_curl','lat_pulldown','leg_extension','dumbbell_front_squat'] as const;
const sample=(degrees:number|null,i:number): ReferenceSample=>({time:i/10,value:degrees===null?null:degrees*Math.PI/180,
  body:{joints:[{x:i/100,y:0.5,visibility:1,opacity:1}]},view:{yaw:0,held:false},multiple:false});
// Held start, lift, held finish, return, held start. Partial and full ROM
// have identical timing but very different observed joint angles.
const rep=[0,0,0,0,0.2,0.4,0.6,0.8,1,1,1,1,0.8,0.6,0.4,0.2,0,0,0,0];

test('all exercises normalize full and partial reps to identical target endpoints and timing',()=>{
  for(const id of ids) for(const range of [20,100]) {
    const timeline=buildReferenceTimeline(id,rep.map((v,i)=>sample(30+v*range,i)));
    assert.equal(referenceAt(timeline,0.2).motion?.progress,0,id);
    assert.equal(referenceAt(timeline,0.9).motion?.progress,1,id);
    assert.equal(referenceAt(timeline,1.7).motion?.progress,0,id);
    assert.ok(Math.abs(referenceAt(timeline,0.55).motion!.progress-0.5)<1e-7);
    assert.equal(referenceAt(timeline,0.9).motion?.direction,'Holding');
    assert.notEqual(referenceAt(timeline,0.6).motion?.direction,referenceAt(timeline,1.4).motion?.direction);
    const saved=referenceAt(timeline,0.55);
    referenceAt(timeline,1.5);referenceAt(timeline,0);
    assert.deepEqual(referenceAt(timeline,0.55),saved,'backward seek and pause are stateless');
  }
});
test('tempo changes retain full range, endpoint holds, and do not advance on wall-clock time',()=>{
  for(const repeat of [1,2,4]) {
    const timeline=buildReferenceTimeline('leg_extension',rep.flatMap(v=>Array(repeat).fill(v)).map((v,i)=>sample(v*25,i)));
    assert.equal(referenceAt(timeline,0.9*repeat).motion?.progress,1);
    assert.deepEqual(referenceAt(timeline,0.9*repeat),referenceAt(timeline,0.9*repeat));
  }
});
test('stationary footage and jitter hold a reference without inventing repetitions',()=>{
  for(const values of [Array(30).fill(50),Array.from({length:30},(_,i)=>50+Math.sin(i)*2)]) {
    const timeline=buildReferenceTimeline('lat_pulldown',values.map(sample));
    assert.equal(timeline.spans.length,0);
    assert.equal(referenceAt(timeline,0.5).motion?.direction,'Holding');
  }
});
test('brief occlusion is inferred while ambiguous people and missing samples break reference continuity',()=>{
  for(const kind of ['hidden','multiple','gap']) {
    let samples=rep.map((v,i)=>sample(v*30,i));
    if(kind==='hidden')samples[6].value=null;
    if(kind==='multiple')samples[6].multiple=true;
    if(kind==='gap')samples=samples.filter((_,i)=>i!==6);
    const timeline=buildReferenceTimeline('dumbbell_curl',samples);
    if(kind==='hidden') {
      assert.equal(referenceAt(timeline,0.6).motion?.direction,'Lifting');
      assert.equal(referenceAt(timeline,0.6).motion?.inferred,true);
    } else {
      assert.ok(!timeline.spans.some(s=>s.start<0.6&&s.end>0.6),kind);
      if(kind==='multiple') assert.equal(referenceAt(timeline,0.6).motion,null);
      else assert.equal(referenceAt(timeline,0.6).motion?.direction,'Holding');
    }
  }
});
const length=(a:SpatialJoint,b:SpatialJoint)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const angle=(a:SpatialJoint,b:SpatialJoint,c:SpatialJoint)=>Math.acos(((a.x-b.x)*(c.x-b.x)+(a.y-b.y)*(c.y-b.y)+(a.z-b.z)*(c.z-b.z))/(length(a,b)*length(c,b)))*180/Math.PI;
test('leg reference straightens the knee without hyperextension and keeps thigh and roller supported',()=>{
  const start=referenceSpatialPose('leg_extension',0),end=referenceSpatialPose('leg_extension',1);
  assert.ok(Math.abs(angle(start[23],start[25],start[27])-90)<1e-7);
  assert.ok(angle(end[23],end[25],end[27])>175&&angle(end[23],end[25],end[27])<180);
  for(const phase of [0,0.25,0.5,0.75,1]) {
    const p=referenceSpatialPose('leg_extension',phase);
    for(const i of [11,23,25])assert.deepEqual(p[i],start[i]);
    const roller=referenceEquipment('leg_extension',p)[4][0];
    assert.ok(Math.abs(length(roller,p[27])/length(p[25],p[27])-0.1)<1e-7);
  }
});
test('pulldown keeps fixed grip, rigid bar, constant arm lengths and elbows down at chest finish',()=>{
  const start=referenceSpatialPose('lat_pulldown',0),end=referenceSpatialPose('lat_pulldown',1);
  assert.ok(angle(start[11],start[13],start[15])>140);
  assert.ok(angle(end[11],end[13],end[15])<80);
  assert.ok(end[13].y>end[11].y&&end[13].y>end[15].y);
  assert.ok(end[13].z<=end[11].z,'elbow does not move behind torso');
  assert.ok(end[15].y>end[11].y&&end[15].y<end[23].y);
  for(let i=0;i<=100;i++) {
    const p=referenceSpatialPose('lat_pulldown',i/100);
    assert.equal(p[15].x,start[15].x);assert.equal(p[16].x,start[16].x);
    assert.ok(Math.abs(length(p[15],p[16])-length(start[15],start[16]))<1e-7);
    for(const [a,b] of [[11,13],[13,15],[12,14],[14,16]])assert.ok(Math.abs(length(p[a],p[b])-0.18)<1e-7);
    assert.equal(p[15].z,start[15].z);
  }
});
test('curl has distinct endpoints and squat reaches parallel with planted feet and front rack',()=>{
  for(const id of ids) assert.notDeepEqual(referenceSpatialPose(id,0),referenceSpatialPose(id,1));
  const low=referenceSpatialPose('dumbbell_front_squat',1),high=referenceSpatialPose('dumbbell_front_squat',0);
  assert.ok(Math.abs(low[23].y-low[25].y)<1e-7);
  for(const i of [27,28,31,32])assert.deepEqual(low[i],high[i]);
  assert.ok(Math.abs(low[15].y-low[11].y)<0.04);
});
test('scan samples are ordered, capped at clip duration and include short clips',()=>{
  for(const duration of [0.03,0.1,1,15]) {
    const times=scanTimes(duration);assert.equal(times[0],0);
    assert.ok(times.at(-1)!<duration);
    assert.ok(times.every((v,i)=>i===0||v>times[i-1]));
  }
  assert.throws(()=>scanTimes(16));
});

test('interpolation keeps uncertain and retained positions visibly marked', () => {
  const a=sample(null,0),b=sample(null,1);
  a.body.joints=[{x:0.2,y:0.5,visibility:1,observed:true,opacity:1}];
  b.body.joints=[{x:0.4,y:0.5,visibility:0.6,observed:true,uncertain:true,opacity:0.8}];
  const timeline=buildReferenceTimeline('dumbbell_curl',[a,b]);
  const middle=referenceAt(timeline,0.05);
  assert.ok(Math.abs(middle.body.joints[0].x-0.3)<1e-7);
  assert.equal(middle.body.joints[0].uncertain,true);
  assert.equal(middle.body.joints[0].visibility,0);
  assert.equal(middle.motion,null);
  assert.deepEqual(referenceAt(timeline,0).body.joints,a.body.joints);
  b.body.joints[0].observed=false;b.body.joints[0].visibility=0;
  assert.equal(referenceAt(buildReferenceTimeline('dumbbell_curl',[a,b]),0.05).body.joints[0].uncertain,true);
});

test('clips starting mid-lift or mid-drop automatically get smooth directional references',()=>{
  for(const direction of [1,-1]) {
    const values=Array.from({length:11},(_,i)=>sample(60+direction*i*3,i));
    const timeline=buildReferenceTimeline('dumbbell_curl',values);
    const early=referenceAt(timeline,0.2).motion!,late=referenceAt(timeline,0.7).motion!;
    assert.equal(early.direction,direction>0?'Lifting':'Lowering');
    assert.equal(early.inferred,true);
    assert.ok((late.progress-early.progress)*direction>0);
    for(let time=0.01;time<0.95;time+=0.01) {
      const a=referenceAt(timeline,time).motion!,b=referenceAt(timeline,time+0.001).motion!;
      assert.ok(Math.abs(b.progress-a.progress)<0.004,'no jumps between scan frames');
    }
    assert.deepEqual(referenceAt(timeline,0.4),referenceAt(timeline,0.4),'pause is deterministic');
    referenceAt(timeline,0.8);
    assert.deepEqual(referenceAt(timeline,0.2).motion,early,'backward seek reproduces phase');
  }
});

test('a long loss of movement tracking holds instead of inventing lifts or drops',()=>{
  const samples=Array.from({length:25},(_,i)=>sample(i<7?i*5:i<17?null:(24-i)*5,i));
  const timeline=buildReferenceTimeline('dumbbell_curl',samples);
  assert.equal(referenceAt(timeline,1.1).motion?.direction,'Holding');
  assert.equal(referenceAt(timeline,1.1).motion?.progress,referenceAt(timeline,1.5).motion?.progress);
  assert.ok(!timeline.spans.some(s=>s.start<1&&s.end>1.6));
});
