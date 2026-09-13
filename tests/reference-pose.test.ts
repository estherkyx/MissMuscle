import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceCurlPose } from '../src/features/video/reference-pose';

test('reference curl preserves upper arms, torso, forearm length and wrist alignment', () => {
  const start = referenceCurlPose(0), top = referenceCurlPose(0.5);
  for (const index of [0, 11, 12, 13, 14, 23, 24]) assert.deepEqual(top[index], start[index]);
  for (const [elbow, wrist, hand] of [[13, 15, 19], [14, 16, 20]]) {
    assert.ok(top[wrist].y < top[elbow].y);
    const length = (pose: ReturnType<typeof referenceCurlPose>) => Math.hypot((pose[wrist].x - pose[elbow].x) * 3, (pose[wrist].y - pose[elbow].y) * 4);
    assert.ok(Math.abs(length(start) - length(top)) < 1e-9);
    const a = top[elbow], b = top[wrist], c = top[hand];
    assert.ok(Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)) < 1e-9);
  }
  assert.deepEqual(referenceCurlPose(1), start);
});
