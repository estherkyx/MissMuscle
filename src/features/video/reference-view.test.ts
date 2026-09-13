import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacingTracker, estimateFacing } from './reference-view';
import { projectReferencePoint, referenceEquipment, referenceSpatialPose, rotateReferencePoint } from './reference-spatial';
import { drawSpatialReference } from './reference-renderer';
const ids=['dumbbell_curl','lat_pulldown','leg_extension','dumbbell_front_squat'] as const;
const sample=(yaw:number)=>{
  const authored=referenceSpatialPose('dumbbell_curl',0.3);
  return {world:authored.map(p=>rotateReferencePoint(p,yaw)),pose:authored.map(p=>projectReferencePoint(p,yaw))};
};
const difference=(a:number,b:number)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));

test('facing recovers front, rear, profiles, three-quarter and mirrored angles across aspect ratios',()=>{
  for(const yaw of [0,Math.PI,-Math.PI/2,Math.PI/2,-Math.PI/4,Math.PI/4,3*Math.PI/4]) {
    const {world,pose}=sample(yaw);
    for(const aspect of [720/1280,1280/720]) {
      const resized=pose.map(p=>({...p,x:0.5+(p.x-0.5)/aspect}));
      assert.ok(difference(estimateFacing(resized,world)!,yaw)<1e-8);
      const mirrored=estimateFacing(resized.map(p=>({...p,x:1-p.x})),world.map(p=>({...p,x:-p.x})));
      assert.ok(difference(mirrored!,Math.PI-yaw)<1e-8);
    }
  }
});
test('facing rejects unreliable, conflicting, nonfinite and degenerate torso data',()=>{
  const {world,pose}=sample(0);
  assert.equal(estimateFacing(pose.map(p=>({...p,visibility:0})),world),null);
  assert.equal(estimateFacing(pose,world.map(p=>({...p,z:NaN}))),null);
  assert.equal(estimateFacing(pose,world.map(p=>({...p,x:0,z:0}))),null);
  const conflicting=world.map(p=>({...p}));
  conflicting[23].x=-world[23].x;conflicting[24].x=-world[24].x;
  assert.equal(estimateFacing(pose,conflicting),null);
  pose[11].visibility=0;
  assert.equal(estimateFacing(pose,world),0,'hips can provide facing when shoulders are hidden');
});
test('tracking smooths wraparound, freezes on pause, expires holds and resets on discontinuities',()=>{
  const tracker=createFacingTracker();
  const update=(yaw:number,time:number)=>{const s=sample(yaw);return tracker.update([s.pose],[s.world],time)!;};
  update(Math.PI-0.05,0);
  const next=update(-Math.PI+0.05,0.04);
  assert.ok(difference(next.yaw,Math.PI)<0.06);
  assert.equal(update(0,0.04).yaw,next.yaw,'same clip time does not advance smoothing');
  assert.equal(tracker.update([],[],0.3)?.held,true);
  assert.equal(tracker.update([],[],0.4),null);
  assert.ok(difference(update(1,0.41).yaw,1)<1e-8);
  assert.ok(difference(update(-1,0).yaw,-1)<1e-8,'backward seek resets');
  assert.ok(difference(update(0.5,2).yaw,0.5)<1e-8,'large forward jump resets');
  const s=sample(0);
  assert.equal(tracker.update([s.pose,s.pose],[s.world,s.world],2.1),null);
  assert.equal(tracker.update([],[],2.2),null);
  update(1,2.3);tracker.reset();assert.equal(tracker.update([],[],2.4),null);
});
test('3D reference keeps segment lengths through movement and rotation with fixed framing',()=>{
  const length=(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number})=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  for(const id of ids) {
    const baseline=referenceSpatialPose(id,0);
    for(const phase of [0,0.25,0.5,0.75,1]) {
      const p=referenceSpatialPose(id,phase);
      for(const [a,b] of [[11,13],[13,15],[23,25],[25,27],[11,23]]) {
        assert.ok(Math.abs(length(p[a],p[b])-length(baseline[a],baseline[b]))<1e-8,`${id} ${a}-${b}`);
      }
      for(const yaw of [0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.5]) {
        const rotated=p.map(q=>rotateReferencePoint(q,yaw));
        for(let a=0;a<p.length;a++) for(let b=0;b<p.length;b++) assert.ok(Math.abs(length(p[a],p[b])-length(rotated[a],rotated[b]))<1e-8);
        for(const q of [...p.filter(q=>q.visibility),...referenceEquipment(id,p).flat()].map(q=>projectReferencePoint(q,yaw))) {
          assert.ok(q.x>=0&&q.x<=1&&q.y>=0&&q.y<=1,`${id} stays framed`);
        }
      }
      if(id==='dumbbell_curl'||id==='dumbbell_front_squat') {
        const [a,b]=referenceEquipment(id,p)[0];
        assert.ok(Math.abs((a.x+b.x)/2-p[15].x)<1e-8);assert.equal(a.y,p[15].y);assert.equal(a.z,p[15].z);
      }
    }
  }
});
test('renderer draws all exercises and angles without invalid canvas geometry',()=>{
  const ctx=new Proxy({}, { get:()=> (...args:unknown[])=>{for(const a of args) if(typeof a==='number') assert.ok(Number.isFinite(a));},set:()=>true }) as CanvasRenderingContext2D;
  for(const id of ids) for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/4]) drawSpatialReference(ctx,300,400,id,0.5,yaw);
});
