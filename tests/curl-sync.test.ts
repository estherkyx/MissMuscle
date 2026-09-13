import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurlSync } from '../src/features/video/curl-sync';
import type { Landmark } from '../src/features/video/muscle-regions';

function pose(degrees: number): Landmark[] {
  const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  points[11] = { x: 0.5, y: 0.2, visibility: 1 };
  points[13] = { x: 0.5, y: 0.4, visibility: 1 };
  const radians = degrees*Math.PI/180;
  points[15] = { x: 0.5-Math.sin(radians)*0.2*4/3, y: 0.4+Math.cos(radians)*0.2, visibility: 1 };
  return points;
}
test('reference follows phase at different speeds, holds, and reverses on lowering', () => {
  for (const step of [0.08, 0.3]) {
    const tracker = createCurlSync();
    const low = tracker.update([pose(5)], 300, 400, 0)!;
    const middle = tracker.update([pose(72.5)], 300, 400, step)!;
    const high = tracker.update([pose(140)], 300, 400, step*2)!;
    assert.ok(Math.abs(low.progress) < 1e-6);
    assert.ok(Math.abs(middle.progress-0.5) < 1e-6);
    assert.ok(Math.abs(high.progress-1) < 1e-6);
    assert.equal(middle.direction, 'Lifting');
    assert.equal(tracker.update([pose(140)], 300, 400, step*3)!.direction, 'Holding');
    assert.equal(tracker.update([pose(72.5)], 300, 400, step*4)!.direction, 'Lowering');
  }
});
test('missing, ambiguous and collapsed arms never advance a reference; seek resets direction', () => {
  const tracker = createCurlSync();
  tracker.update([pose(140)], 300, 400, 4);
  assert.equal(tracker.update([], 300, 400, 4.1), null);
  assert.equal(tracker.update([pose(50), pose(50)], 300, 400, 4.2), null);
  const hidden = pose(50); hidden[15].visibility = 0.1;
  assert.equal(tracker.update([hidden], 300, 400, 4.3), null);
  const collapsed = pose(50); collapsed[15] = collapsed[13];
  assert.equal(tracker.update([collapsed], 300, 400, 4.4), null);
  tracker.reset();
  assert.equal(tracker.update([pose(5)], 300, 400, 0)!.direction, 'Holding');
});
