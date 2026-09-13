import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { drawMappedBody } from './mapped-body';
import { ReferenceMotion } from './ReferenceMotion';
import { createCurlSync, type CurlMotion } from './curl-sync';

export function MuscleOverlay({ videoRef, enabled }: { videoRef: RefObject<HTMLVideoElement | null>; enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const [mapped, setMapped] = useState(false);
  const [time, setTime] = useState(0);
  const [motion, setMotion] = useState<CurlMotion | null>(null);

  useEffect(() => {
    setMapped(false); setMotion(null);
    if (!enabled) return;
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    let disposed = false, detector: PoseLandmarker | undefined, animation = 0;
    let lastTime = -1, lastRun = 0;
    const sync = createCurlSync();
    const clear = () => canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    const invalidate = () => { clear(); setMapped(false); setMotion(null); sync.reset(); lastTime = -1; };
    video.addEventListener('seeking', invalidate);
    video.addEventListener('emptied', invalidate);
    const resize = new ResizeObserver(invalidate);
    resize.observe(canvas.parentElement!);
    const timeout = window.setTimeout(() => {
      if (!detector && !disposed) { disposed = true; setFailed(true); setStatus('Tracking could not load. Check your connection and retry.'); }
    }, 30_000);

    function tick(now: number) {
      if (disposed) return;
      try {
        if (video!.seeking || video!.readyState < 2) { clear(); setMapped(false); setMotion(null); sync.reset(); }
        else if (detector && video!.currentTime !== lastTime && now - lastRun >= 80) {
          lastTime = video!.currentTime; lastRun = now;
          const result = detector.detect(video!);
          const hasPose = result.landmarks.length === 1 && result.landmarks[0].some(p => (p.visibility ?? 0) >= 0.75);
          const context = canvas!.getContext('2d');
          if (!context) throw new Error('Canvas unavailable');
          const width = canvas!.parentElement!.clientWidth, height = canvas!.parentElement!.clientHeight;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          canvas!.width = Math.round(width * dpr); canvas!.height = Math.round(height * dpr);
          context.scale(dpr, dpr);
          drawMappedBody(context, width, height, video!.videoWidth, video!.videoHeight, result.landmarks);
          setMotion(sync.update(result.landmarks, video!.videoWidth, video!.videoHeight, video!.currentTime));
          setMapped(hasPose); setTime(video!.currentTime);
          setStatus(result.landmarks.length > 1 ? 'Multiple people visible; a single body map is unavailable.' : hasPose ? '' : 'No clear body regions detected at this moment.');
        }
        animation = requestAnimationFrame(tick);
      } catch {
        clear(); setMapped(false); setMotion(null); setFailed(true); setStatus('Tracking stopped. Retry, or try this clip in Chrome.');
        detector?.close(); detector = undefined;
      }
    }

    setFailed(false); setStatus('Loading body tracker…');
    void (async () => {
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
      const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm');
      if (disposed) return;
      const loaded = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'GPU' },
        runningMode: 'IMAGE', numPoses: 2, minPoseDetectionConfidence: 0.65, minPosePresenceConfidence: 0.65,
      });
      if (disposed) { loaded.close(); return; }
      detector = loaded; window.clearTimeout(timeout); animation = requestAnimationFrame(tick);
    })().catch(() => {
      if (!disposed) { setFailed(true); setStatus('Body tracking is unavailable. Check your connection and browser, then retry.'); }
      window.clearTimeout(timeout);
    });
    return () => {
      disposed = true; window.clearTimeout(timeout); cancelAnimationFrame(animation);
      video.removeEventListener('seeking', invalidate); video.removeEventListener('emptied', invalidate);
      resize.disconnect(); detector?.close(); clear();
    };
  }, [enabled, videoRef]);

  return <>
    <ReferenceMotion motion={enabled && !failed ? motion : null} />
    <div className="mapped-view">
      <div className="viewer-heading"><span>02 / Body map</span><span>{enabled && mapped ? `${time.toFixed(2)}s / SYNCED` : '2D POSE'}</span></div>
      <div className="mapped-stage">
        <canvas ref={canvasRef} aria-label="Moving body visualization with educational muscle target colors" />
        {(!enabled || !mapped || failed) && <div className="mapped-empty"><span aria-hidden="true">?</span><strong>{!enabled ? 'See your movement mapped' : failed ? 'Mapping unavailable' : 'Waiting for a visible pose'}</strong><p>{!enabled ? 'A body map follows your clip as you play, pause and seek.' : status}</p></div>}
      </div>
    </div>
    <div className="muscle-overlay-controls">
      <div className="heatmap-legend"><span><i className="heat-primary" />Primary targets</span><span><i className="heat-secondary" />Supporting muscles</span><span><i className="heat-other" />Other areas</span></div>
    </div>
  </>;
}
