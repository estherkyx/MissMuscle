import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoseFilter, reliableJoint } from './pose-filter';
import { drawMappedBody } from './mapped-body';
import { referenceExercisePose } from './exercise-pose';
import { createExerciseSync } from './exercise-motion';
import type { ExerciseId } from '../../../shared/contracts';

const pose = () => referenceExercisePose('dumbbell_curl', 0.2);

test('small jitter is reduced while sustained movement remains responsive', () => {
  const filter = createPoseFilter(), p = pose();
  filter.update([p], 720, 1280, 0);
  const original = p[15].x;
  p[15].x += 0.02;
  const first = filter.update([p], 720, 1280, 0.04).joints[15];
  assert.ok(first.x > original && first.x < p[15].x);
  for (let i = 2; i <= 6; i++) filter.update([p], 720, 1280, i*0.04);
  assert.ok(Math.abs(filter.update([p], 720, 1280, 0.28).joints[15].x-p[15].x) < 0.001);
});

test('lost joints hold, fade, and never count as observations; pause freezes aging', () => {
  const filter = createPoseFilter(), p = pose();
  filter.update([p], 720, 1280, 0);
  p[15].visibility = 0;
  const held = filter.update([p], 720, 1280, 0.1).joints[15];
  assert.equal(held.opacity, 1);
  assert.equal(held.uncertain, true);
  assert.equal(reliableJoint(held), false);
  assert.deepEqual(filter.update([p], 720, 1280, 0.1).joints[15], held);
  assert.ok(Math.abs(filter.update([p], 720, 1280, 0.25).joints[15].opacity!-0.5) < 1e-8);
  assert.equal(filter.update([], 720, 1280, 0.36).joints[15].opacity, 0);
});

test('isolated jumps are rejected and sustained relocation is reacquired', () => {
  const filter = createPoseFilter(), p = pose();
  const original = filter.update([p], 1280, 720, 0).joints[15].x;
  p[15].x = original < 0.5 ? 0.95 : 0.05;
  const rejected = filter.update([p], 1280, 720, 0.04).joints[15];
  assert.equal(rejected.x, original);
  assert.equal(rejected.uncertain, true);
  const accepted = filter.update([p], 1280, 720, 0.08).joints[15];
  assert.ok(reliableJoint(accepted));
  assert.ok(Math.abs(accepted.x-p[15].x) < Math.abs(original-p[15].x));
});

test('invalid and unseen joints are never filled from a reference pose', () => {
  const filter = createPoseFilter(), p = pose();
  p[15].x = NaN; p[16].x = 1.2; p[25].visibility = 0.1;
  const result = filter.update([p], 720, 1280, 0);
  for (const i of [15,16,25]) assert.equal(result.joints[i].opacity, 0);
});

test('multiple people and reset discard all retained positions and body calibration', () => {
  const filter = createPoseFilter(), p = pose();
  filter.update([p], 720, 1280, 0);
  assert.deepEqual(filter.update([p,p], 720, 1280, 0.04), { joints: [] });
  assert.equal(filter.update([], 720, 1280, 0.08).joints.length, 0);
  filter.update([p], 720, 1280, 0.12);
  filter.reset();
  assert.deepEqual(filter.update([], 720, 1280, 0.16), { joints: [], torsoSize: undefined });
});

test('backward seeks discard old joints and thickness stays fixed during motion', () => {
  const filter = createPoseFilter(), p = pose();
  const first = filter.update([p], 720, 1280, 1);
  p[23].y += 0.02;
  assert.equal(filter.update([p], 720, 1280, 1.04).torsoSize, first.torsoSize);
  assert.equal(filter.update([], 720, 1280, 0).joints.length, 0);
});

test('all exercises exclude retained joints from reference movement', () => {
  for (const exercise of ['dumbbell_curl','lat_pulldown','leg_extension','dumbbell_front_squat'] as ExerciseId[]) {
    const filter = createPoseFilter(), sync = createExerciseSync(exercise);
    const p = referenceExercisePose(exercise, 0.3);
    filter.update([p], 720, 1280, 0);
    const held = filter.update([], 720, 1280, 0.1);
    assert.equal(sync.update([held.joints], 720, 1280, 0.1), null);
  }
});

test('a wandering foot cannot change torso framing in portrait or landscape', () => {
  for (const [width,height] of [[720,1280],[1280,720]]) {
    const render = (p: ReturnType<typeof pose>, canvasWidth = 400) => {
      const vertices: number[][] = [];
      const ctx = new Proxy({}, { get: (_, key) => key === 'moveTo' || key === 'lineTo'
        ? (...args: number[]) => vertices.push(args) : () => {}, set: () => true }) as CanvasRenderingContext2D;
      drawMappedBody(ctx, canvasWidth, 600, width, height, [p], 'dumbbell_curl', { joints: p, torsoSize: 0.3 });
      return vertices;
    };
    const p = pose(), before = render(p);
    p[31] = { x: 0.99, y: 0.99, visibility: 1 };
    const after = render(p);
    // Grid then torso are drawn before any foot segments.
    assert.deepEqual(after.slice(0,70), before.slice(0,70));
    assert.deepEqual(render(p), after, 'redrawing a paused frame is deterministic');
    assert.notDeepEqual(render(p, 800), after, 'resize recomputes the video contain rectangle');
  }
});
