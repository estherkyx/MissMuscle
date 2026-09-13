export type PoseDelegate = 'GPU' | 'CPU';

export async function loadPoseModel(fetchAsset: typeof fetch = fetch): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetchAsset('/models/pose_landmarker_lite.task', { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error('The local body-tracking model could not be downloaded. Reload the page and retry.');
  }
  if (!response.ok) throw new Error(`The body-tracking model is missing from this app (HTTP ${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // MediaPipe task bundles have a two-byte prefix followed by a ZIP header.
  // Detect an HTML fallback/error page before passing it into the WASM runtime.
  if (bytes.length < 8 || bytes[2] !== 0x50 || bytes[3] !== 0x4b || bytes[4] !== 3 || bytes[5] !== 4) {
    throw new Error('The app returned an invalid body-tracking model. Rebuild the app assets and reload.');
  }
  return bytes;
}

export async function initializePoseWithFallback<T>(create: (delegate: PoseDelegate) => Promise<T>): Promise<T> {
  try { return await create('GPU'); }
  catch (gpuError) {
    try { return await create('CPU'); }
    catch (cpuError) {
      // Actual initialization errors remain diagnosable instead of being mislabeled
      // as a connection failure. These errors contain no camera frames.
      console.error('Pose tracker initialization failed', { gpuError, cpuError });
      const detail = cpuError instanceof Error ? cpuError.message.slice(0, 180) : 'Unknown initialization error';
      throw new Error(`Body tracking could not initialise in this browser: ${detail}`);
    }
  }
}
