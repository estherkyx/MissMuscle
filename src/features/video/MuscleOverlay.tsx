import { useEffect, useRef, useState, type RefObject } from 'react';
import { drawMappedBody } from './mapped-body';
import { ReferenceMotion } from './ReferenceMotion';
import { createCurlSync, type CurlMotion } from './curl-sync';
import type { Landmark } from './muscle-regions';

export function MuscleOverlay({ videoRef, enabled, live = false, onTrackingRate }: {
  videoRef: RefObject<HTMLVideoElement | null>; enabled: boolean; live?: boolean; onTrackingRate?: (fps: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const [mapped, setMapped] = useState(false);
  const [time, setTime] = useState(0);
  const [motion, setMotion] = useState<CurlMotion | null>(null);
  const [retry, setRetry] = useState(0);
  const rateRef = useRef(onTrackingRate); rateRef.current = onTrackingRate;

  useEffect(() => {
    setMapped(false); setMotion(null);
    if (!enabled) return;
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    let disposed = false, ready = false, busy = false, animation = 0, generation = 0;
    let lastTime = -1, lastRun = 0, count = 0, rateStart = performance.now();
    const sync = createCurlSync();
    const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' });
    const clear = () => canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    const invalidate = () => { generation++; clear(); setMapped(false); setMotion(null); sync.reset(); lastTime = -1; };
    const fail = (message: string) => { ready = false; clear(); setMapped(false); setMotion(null); setFailed(true); setStatus(message); worker.terminate(); };
    video.addEventListener('seeking', invalidate); video.addEventListener('emptied', invalidate);
    const resize = new ResizeObserver(invalidate); resize.observe(canvas.parentElement!);
    const timeout = window.setTimeout(() => { if (!ready && !disposed) fail('Tracking could not load. Check your connection and retry.'); }, 30_000);
    worker.onerror = () => { if (!disposed) fail('Body tracking is unavailable. Retry in Chrome.'); };
    worker.onmessage = event => {
      if (disposed) return;
      if (event.data.type === 'ready') { ready = true; window.clearTimeout(timeout); return; }
      if (event.data.type === 'error') { window.clearTimeout(timeout); fail(event.data.message); return; }
      if (event.data.type !== 'pose') return;
      busy = false;
      if (event.data.generation !== generation) return;
      const poses = event.data.landmarks as Landmark[][];
      const hasPose = poses.length === 1 && poses[0].some(p => (p.visibility ?? 0) >= 0.75);
      const context = canvas.getContext('2d');
      if (!context) { fail('Canvas unavailable.'); return; }
      const width = canvas.parentElement!.clientWidth, height = canvas.parentElement!.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); context.scale(dpr, dpr);
      drawMappedBody(context, width, height, video.videoWidth, video.videoHeight, poses);
      setMotion(sync.update(poses, video.videoWidth, video.videoHeight, event.data.time));
      setMapped(hasPose); setTime(event.data.time);
      setStatus(poses.length > 1 ? 'Multiple people visible; a single body map is unavailable.' : hasPose ? '' : 'Move into view so your shoulders, elbows and wrists are visible.');
      count++;
      if (performance.now() - rateStart >= 2000) { rateRef.current?.(count * 1000 / (performance.now() - rateStart)); count = 0; rateStart = performance.now(); }
    };
    function tick(now: number) {
      if (disposed) return;
      if (video!.seeking || video!.readyState < 2) { clear(); setMapped(false); setMotion(null); sync.reset(); }
      else if (ready && !busy && video!.currentTime !== lastTime && now - lastRun >= 80) {
        busy = true; lastTime = video!.currentTime; lastRun = now;
        const frameGeneration = generation, frameTime = video!.currentTime;
        void createImageBitmap(video!).then(bitmap => {
          if (disposed || !ready) { bitmap.close(); return; }
          worker.postMessage({ type: 'frame', bitmap, timestampMs: now, time: frameTime, generation: frameGeneration }, [bitmap]);
        }).catch(() => { busy = false; if (!disposed) fail('Camera frame could not be tracked. Retry tracking.'); });
      }
      animation = requestAnimationFrame(tick);
    }
    setFailed(false); setStatus('Loading body tracker…'); worker.postMessage({ type: 'init' }); animation = requestAnimationFrame(tick);
    return () => {
      disposed = true; window.clearTimeout(timeout); cancelAnimationFrame(animation); worker.terminate();
      video.removeEventListener('seeking', invalidate); video.removeEventListener('emptied', invalidate); resize.disconnect(); clear();
    };
  }, [enabled, videoRef, retry]);

  return <>
    <ReferenceMotion motion={enabled && !failed ? motion : null} />
    <div className="mapped-view">
      <div className="viewer-heading"><span>02 / Body map</span><span>{live ? 'LIVE POSE' : enabled && mapped ? `${time.toFixed(2)}s / SYNCED` : '2D POSE'}</span></div>
      <div className="mapped-stage">
        <canvas ref={canvasRef} aria-label="Moving body visualization with educational muscle target colors" />
        {(!enabled || !mapped || failed) && <div className="mapped-empty"><span aria-hidden="true">?</span><strong>{!enabled ? 'See your movement mapped' : failed ? 'Mapping unavailable' : 'Waiting for a visible pose'}</strong><p>{!enabled ? 'A body map follows your clip as you play, pause and seek.' : status}</p>{failed && <button className="secondary small-button" onClick={() => setRetry(value => value + 1)}>Retry tracking</button>}</div>}
      </div>
    </div>
    <div className="muscle-overlay-controls">
      <div className="heatmap-legend"><span><i className="heat-primary" />Primary targets</span><span><i className="heat-secondary" />Supporting muscles</span><span><i className="heat-other" />Other areas</span></div>
      <span className="muted">Educational muscle targets · not measured activation</span>
    </div>
  </>;
}
