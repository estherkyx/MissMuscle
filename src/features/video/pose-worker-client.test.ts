import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoseWorker } from './pose-worker-client';

test('uploaded worker forwards spatial poses, propagates failure, and cancels pending startup', async () => {
  const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  const originalBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  let latest: FakeWorker;
  let pauseStartup = false;
  let failFrame = false;
  class FakeWorker {
    onmessage?: (event: { data: unknown }) => void;
    onerror?: () => void;
    terminated = false;
    constructor() { latest = this; }
    terminate() { this.terminated = true; }
    postMessage(message: { type: string }) {
      if (message.type === 'init' && pauseStartup) return;
      queueMicrotask(() => this.onmessage?.({ data: message.type === 'init' ? { type: 'ready' } : failFrame
        ? { type: 'error', message: 'Detector failed' }
        : { type: 'pose', landmarks: [[{ x: 0.5, y: 0.5, z: 0 }]], worldLandmarks: [[{ x: 1, y: 2, z: 3 }]] } }));
    }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => ({ close() {} }) });
  try {
    const controller = new AbortController();
    const client = await createPoseWorker(controller.signal);
    const pose = await client.detectForVideo({} as HTMLVideoElement, 100);
    assert.equal(pose.landmarks[0][0].x, 0.5);
    assert.equal(pose.worldLandmarks[0][0].z, 3);
    failFrame = true;
    await assert.rejects(client.detectForVideo({} as HTMLVideoElement, 200), /Detector failed/);
    assert.equal(latest!.terminated, true);
    pauseStartup = true;
    const pending = createPoseWorker(controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(latest!.terminated, true);
  } finally {
    if (originalWorker) Object.defineProperty(globalThis, 'Worker', originalWorker); else Reflect.deleteProperty(globalThis, 'Worker');
    if (originalBitmap) Object.defineProperty(globalThis, 'createImageBitmap', originalBitmap); else Reflect.deleteProperty(globalThis, 'createImageBitmap');
  }
});
