import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import simdLoader from '../../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js?raw';
import scalarLoader from '../../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js?raw';
import simdBinary from '../../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm?url';
import scalarBinary from '../../../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm?url';
import { initializePoseWithFallback, loadPoseModel } from './pose-initialization';
import { poseLoaderModule } from './pose-loader-module';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
  ModuleFactory?: unknown;
  Module?: unknown;
};
let detector: PoseLandmarker | undefined;
let initializing = false;

async function initialize() {
  if (typeof OffscreenCanvas === 'undefined') throw new Error('Body tracking needs OffscreenCanvas. Open this app in a current Chrome browser.');
  const modelAssetBuffer = await loadPoseModel();
  const simd = await FilesetResolver.isSimdSupported();
  // Package the version-matched loader and WASM with Vite. MediaPipe's classic
  // importScripts loader does not run in module workers; import its factory once
  // as a local ES module, then hand that factory directly to the runtime.
  const moduleUrl = URL.createObjectURL(new Blob([poseLoaderModule(simd ? simdLoader : scalarLoader)], { type: 'text/javascript' }));
  try {
    const { default: factory } = await import(/* @vite-ignore */ moduleUrl);
    // Resolve relative Vite asset URLs against the worker URL, never the Blob URL.
    const files = { wasmLoaderPath: '', wasmBinaryPath: new URL(simd ? simdBinary : scalarBinary, self.location.href).href };
    detector = await initializePoseWithFallback(delegate => {
      // MediaPipe consumes/clears these globals, including on partial startup.
      // A CPU retry must start with a fresh factory and canvas.
      scope.Module = undefined; scope.ModuleFactory = factory;
      return PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetBuffer, delegate }, canvas: new OffscreenCanvas(1, 1),
        runningMode: 'VIDEO', numPoses: 2, minPoseDetectionConfidence: 0.65, minPosePresenceConfidence: 0.65,
      });
    });
  } finally { URL.revokeObjectURL(moduleUrl); }
}

scope.onmessage = event => {
  if (event.data.type === 'init' && !initializing) {
    initializing = true;
    void initialize().then(() => scope.postMessage({ type: 'ready' })).catch(error => {
      console.error('Body tracker startup failed', error);
      scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Body tracking could not initialise. Reload the page and retry.' });
    });
  }
  if (event.data.type === 'frame') {
    const bitmap = event.data.bitmap as ImageBitmap;
    try {
      if (!detector) throw new Error('Tracker is not ready');
      const result = detector.detectForVideo(bitmap, event.data.timestampMs);
      scope.postMessage({ type: 'pose', landmarks: result.landmarks, time: event.data.time, generation: event.data.generation });
    } catch (error) {
      console.error('Body tracking frame failed', error);
      scope.postMessage({ type: 'error', message: 'Body tracking stopped. Retry tracking in Chrome.' });
    } finally { bitmap.close(); }
  }
};
