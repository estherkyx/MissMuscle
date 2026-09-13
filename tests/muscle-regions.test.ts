import test from 'node:test';
import assert from 'node:assert/strict';
import { containRect, muscleRegions, type Landmark } from '../src/features/video/muscle-regions';

function person(): Landmark[] {
  const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.2, visibility: 0.99 }));
  p[11] = { x: 0.7, y: 0.3, visibility: 0.99 }; p[12] = { x: 0.3, y: 0.3, visibility: 0.99 };
  p[13] = { x: 0.8, y: 0.5, visibility: 0.99 }; p[14] = { x: 0.2, y: 0.5, visibility: 0.99 };
  p[23] = { x: 0.65, y: 0.8, visibility: 0.99 }; p[24] = { x: 0.35, y: 0.8, visibility: 0.99 };
  return p;
}
test('muscle guides follow joint movement and suppress hidden arms', () => {
  const pose = person();
  const before = muscleRegions([pose]);
  assert.equal(before.length, 6);
  pose[13].x = 0.5;
  assert.notDeepEqual(muscleRegions([pose])[1].points, before[1].points);
  pose[13].visibility = 0.1;
  assert.equal(muscleRegions([pose]).filter(r => r.label === 'Biceps area').length, 1);
});
test('no guides for missing or ambiguous people; hidden or rear torso has no chest/abs', () => {
  assert.deepEqual(muscleRegions([]), []);
  assert.deepEqual(muscleRegions([person(), person()]), []);
  for (const index of [0, 23, 24]) {
    const pose = person(); pose[index].visibility = 0.1;
    assert.equal(muscleRegions([pose]).length, 4);
  }
  const rear = person(); [rear[11], rear[12]] = [rear[12], rear[11]];
  assert.equal(muscleRegions([rear]).length, 4);
  const outside = person(); outside[13].x = NaN;
  assert.equal(muscleRegions([outside]).filter(r => r.label === 'Biceps area').length, 1);
});
test('overlay uses actual image bounds for portrait and landscape letterboxing', () => {
  assert.deepEqual(containRect(400, 300, 1920, 1080), { x: 0, y: 37.5, width: 400, height: 225 });
  assert.deepEqual(containRect(400, 300, 1080, 1920), { x: 115.625, y: 0, width: 168.75, height: 300 });
});
