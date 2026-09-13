import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepActivity } from '../src/features/live/rep-activity';
import type { Landmark } from '../src/features/video/muscle-regions';
import { referenceExercisePose } from '../src/features/video/exercise-pose';

function pose(progress: number, side = 11, shift = 0, scale = 1): Landmark[] {
  const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const angle = (5 + progress * 135) * Math.PI / 180;
  points[side] = { x: 0.5 + shift, y: 0.2, visibility: 1 };
  points[side + 2] = { x: 0.5 + shift, y: 0.2 + 0.2 * scale, visibility: 1 };
  points[side + 4] = { x: 0.5 + shift - Math.sin(angle) * 0.2 * scale * 4 / 3, y: 0.2 + 0.2 * scale + Math.cos(angle) * 0.2 * scale, visibility: 1 };
  return points;
}

test('either arm preserves its last lowering phase, without counting stationary time or a walk to stop', () => {
  for (const side of [11, 12]) {
    const tracker = createRepActivity();
    let end = 0;
    const sample = (progress: number, time: number, shift = 0, scale = 1) => {
      if (tracker.update([pose(progress, side, shift, scale)], 300, 400, time)) end = time;
    };
    for (let frame = 0; frame <= 40; frame++) sample(frame <= 20 ? frame / 20 : (40 - frame) / 20, frame / 10);
    assert.ok(end >= 3.8 && end <= 4, `last lowering frame: ${end}`);
    const lastRep = end;
    for (let frame = 41; frame <= 100; frame++) sample(0, frame / 10);
    // Approach the camera while bending and extending an arm to reach controls.
    for (let frame = 0; frame <= 30; frame++) sample(frame <= 15 ? frame / 15 : (30 - frame) / 15, 10.1 + frame / 10, frame * 0.009, 1 + frame * 0.035);
    assert.equal(end, lastRep);
  }
});

test('small noise, an isolated reach, missing people and tracking gaps do not establish a rep', () => {
  const tracker = createRepActivity();
  for (let frame = 0; frame < 30; frame++) assert.equal(tracker.update([pose(0.1 + (frame % 2) * 0.01)], 300, 400, frame / 10), false);
  for (let frame = 0; frame <= 10; frame++) assert.equal(tracker.update([pose(frame / 10)], 300, 400, 3 + frame / 10), false);
  assert.equal(tracker.update([], 300, 400, 4.1), false);
  assert.equal(tracker.update([pose(0.3)], 300, 400, 4.2), false);
  assert.equal(tracker.update([pose(0.1), pose(0.1)], 300, 400, 4.3), false);
  assert.equal(tracker.update([pose(0)], 300, 400, 10), false);
});

test('partial-range curls and slow lowering can retain movement without requiring ideal form', () => {
  const tracker = createRepActivity();
  let end = 0;
  for (let frame = 0; frame <= 120; frame++) {
    const progress = frame <= 40 ? 0.2 + frame * 0.01 : 0.6 - (frame - 40) * 0.005;
    if (tracker.update([pose(progress)], 300, 400, frame / 10)) end = frame / 10;
  }
  assert.ok(end >= 10.5, `retains late lowering even when each step is very small: ${end}`);
});

for(const exerciseId of ['lat_pulldown','leg_extension','dumbbell_front_squat'] as const) test(`${exerciseId}: retains the exercise return and ignores waiting or walking to the controls`,()=>{
  for(const side of [0,1]) {
    const tracker=createRepActivity(exerciseId);
    const poseAt=(progress:number,shift=0)=>referenceExercisePose(exerciseId,progress).map((point,index)=>({
      ...point,x:point.x+shift,visibility:[11,13,15,23,25,27].map(i=>i+1-side).includes(index)?0:point.visibility,
    }));
    let end=0;
    for(let frame=0;frame<=40;frame++) if(tracker.update([poseAt(frame<=20?frame/20:(40-frame)/20)],300,400,frame/10))end=frame/10;
    assert.ok(end>=3.5,`${exerciseId}, side ${side}: return ends at ${end}`);
    const lastRep=end;
    for(let frame=41;frame<=100;frame++) if(tracker.update([poseAt(0)],300,400,frame/10))end=frame/10;
    for(let frame=0;frame<30;frame++) if(tracker.update([poseAt(frame<=15?frame/15:(30-frame)/15,frame*0.015)],300,400,10.1+frame/10))end=10.1+frame/10;
    assert.equal(end,lastRep,'walking after the exercise cannot replace the replay');
  }
});
