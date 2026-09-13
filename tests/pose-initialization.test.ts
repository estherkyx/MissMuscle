import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { initializePoseWithFallback, loadPoseModel } from '../src/features/video/pose-initialization';

test('the shipped pose model is the pinned official task bundle', async () => {
  const bytes = await readFile(new URL('../public/models/pose_landmarker_lite.task', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a');
  const model = await loadPoseModel(async input => {
    assert.equal(input, '/models/pose_landmarker_lite.task');
    return new Response(bytes);
  });
  assert.equal(model.length, 5777746);
});
test('model loading identifies a missing file or HTML fallback instead of blaming pose detection', async () => {
  await assert.rejects(loadPoseModel(async () => new Response('missing', { status: 404 })), /missing.*404/);
  await assert.rejects(loadPoseModel(async () => new Response('<!doctype html><html>app shell</html>')), /invalid body-tracking model/);
  await assert.rejects(loadPoseModel(async () => { throw new TypeError('Failed to fetch'); }), /local body-tracking model could not be downloaded/);
});
test('GPU initialization failure retries a real CPU detector once', async () => {
  const delegates: string[] = [];
  const detector = { name: 'test detector' };
  assert.equal(await initializePoseWithFallback(async delegate => {
    delegates.push(delegate);
    if (delegate === 'GPU') throw new Error('WebGL unavailable');
    return detector;
  }), detector);
  assert.deepEqual(delegates, ['GPU', 'CPU']);
});
test('failure of both delegates preserves the actual initialization cause', async t => {
  t.mock.method(console, 'error', () => {});
  await assert.rejects(initializePoseWithFallback(async () => { throw new Error('WASM compilation failed'); }), /could not initialise.*WASM compilation failed/);
});
