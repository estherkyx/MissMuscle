import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeBodyGaps,interpolateBody} from './body-timeline';
import type {FilteredPose} from './pose-filter';
const sample=(x:number|null,i:number)=>({time:i/10,multiple:false,body:{joints:[x===null?
  {x:0,y:0,visibility:0,opacity:0}:{x,y:0.5,visibility:1,opacity:1,observed:true}]} as FilteredPose});

test('short occlusions follow the same joint between neighboring observations',()=>{
  const input=[sample(0.2,0),sample(null,1),sample(null,2),sample(0.5,3)];
  const filled=bridgeBodyGaps(input);
  assert.equal(input[1].body.joints[0].opacity,0,'does not mutate detections');
  assert.ok(Math.abs(filled[1].body.joints[0].x-0.3)<1e-7);
  assert.equal(filled[1].body.joints[0].uncertain,true);
  assert.equal(filled[1].body.joints[0].observed,false);
  for(let i=0;i<3;i++) {
    const midpoint=interpolateBody(filled,i,0.5).joints[0];
    assert.ok(midpoint.x>filled[i].body.joints[0].x&&midpoint.x<filled[i+1].body.joints[0].x);
    assert.equal(midpoint.uncertain,true);
  }
});

test('inference never fills unseen joints, long occlusions or multiple-person intervals',()=>{
  for(const kind of ['unseen','long','multiple']) {
    const input=Array.from({length:9},(_,i)=>sample(i===0&&kind!=='unseen'?0.2:i===8?0.5:null,i));
    if(kind==='multiple') {input[3]=sample(0.4,3);input[1].multiple=true;}
    assert.equal(bridgeBodyGaps(input)[1].body.joints[0].opacity,0,kind);
  }
});

test('cubic body interpolation stays within observations and has continuous velocity',()=>{
  const samples=[sample(0.2,0),sample(0.3,1),sample(0.45,2),sample(0.5,3)];
  for(let i=0;i<3;i++) for(let t=0;t<1;t+=0.02) {
    const p=interpolateBody(samples,i,t).joints[0];
    assert.ok(p.x>=samples[i].body.joints[0].x&&p.x<=samples[i+1].body.joints[0].x);
  }
  const h=0.0001;
  const left=(0.3-interpolateBody(samples,0,1-h).joints[0].x)/h;
  const right=(interpolateBody(samples,1,h).joints[0].x-0.3)/h;
  assert.ok(Math.abs(left-right)<0.0001);
  assert.deepEqual(interpolateBody(samples,1,0.3),interpolateBody(samples,1,0.3));
});
