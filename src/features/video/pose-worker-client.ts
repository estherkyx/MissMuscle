import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import type { ReferenceDetector } from './reference-scan';

type WorkerResponse = { type: 'ready' } | ({ type: 'pose' } & Pick<PoseLandmarkerResult, 'landmarks' | 'worldLandmarks'>);

export interface PoseWorkerClient extends ReferenceDetector {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): Promise<Pick<PoseLandmarkerResult, 'landmarks' | 'worldLandmarks' | 'close'>>;
  close(): void;
}

// Uploaded scans use the same packaged runtime and GPU/CPU fallback as live tracking.
export async function createPoseWorker(signal: AbortSignal): Promise<PoseWorkerClient> {
  signal.throwIfAborted();
  const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' });
  let closed = false;
  let pending: { resolve(value: WorkerResponse): void; reject(error: Error): void } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (closed) return;
    closed = true; clearTimeout(timer); worker.terminate(); signal.removeEventListener('abort', close);
    pending?.reject(new DOMException('Tracking stopped', 'AbortError')); pending = undefined;
  };
  const fail = (error: Error) => { pending?.reject(error); pending = undefined; close(); };
  const wait = () => new Promise<WorkerResponse>((resolve, reject) => {
    pending = { resolve, reject };
    timer = setTimeout(() => fail(new Error('Body tracking timed out. Retry tracking.')), 30_000);
  });
  worker.onmessage = ({ data }) => {
    if (data.type === 'error') { fail(new Error(data.message)); return; }
    if (data.type !== 'ready' && data.type !== 'pose') return;
    clearTimeout(timer); const request = pending; pending = undefined; request?.resolve(data);
  };
  worker.onerror = () => fail(new Error('Body tracking could not load. Retry in Chrome.'));
  signal.addEventListener('abort', close, { once: true });
  const ready = wait(); worker.postMessage({ type: 'init' }); await ready;
  return {
    async detectForVideo(video, timestampMs) {
      signal.throwIfAborted();
      if (closed) throw new Error('Tracker is closed');
      if (pending) throw new Error('A tracking request is already running');
      const bitmap = await createImageBitmap(video);
      if (closed || signal.aborted) { bitmap.close(); throw new DOMException('Tracking stopped', 'AbortError'); }
      const response = wait();
      try { worker.postMessage({ type: 'frame', bitmap, timestampMs, time: timestampMs / 1000, generation: 0 }, [bitmap]); }
      catch (error) { bitmap.close(); fail(error instanceof Error ? error : new Error('Could not send tracking frame')); }
      const result = await response;
      if (result.type !== 'pose') throw new Error('Unexpected tracking response');
      return { landmarks: result.landmarks, worldLandmarks: result.worldLandmarks, close() {} };
    },
    close,
  };
}
