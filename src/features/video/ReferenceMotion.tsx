import { useEffect, useRef } from 'react';
import { drawMappedBody } from './mapped-body';
import { referenceCurlPose } from './reference-pose';
import type { CurlMotion } from './curl-sync';

export function ReferenceMotion({ motion }: { motion: CurlMotion | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d');
    if (!context) return;
    const draw = () => {
      const width = canvas.parentElement!.clientWidth, height = canvas.parentElement!.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
      context.scale(dpr, dpr);
      drawMappedBody(context, width, height, 3, 4, motion ? [referenceCurlPose(motion.progress)] : []);
    };
    draw();
    const resize = new ResizeObserver(draw); resize.observe(canvas.parentElement!);
    return () => resize.disconnect();
  }, [motion]);
  return <section className="reference-motion" aria-label="Reference curl form animation">
    <div className="viewer-heading"><span>03 / Reference form</span><span>{motion ? `${motion.time.toFixed(2)}s / SYNCED` : 'WAITING'}</span></div>
    <div className="mapped-stage">
      <canvas ref={canvasRef} aria-label="Reference form following the detected curl movement" />
      {motion ? <span className="reference-phase">{motion.direction}</span> : <div className="mapped-empty"><strong>Waiting for curl movement</strong><p>Start body mapping to synchronize the reference.</p></div>}
    </div>
  </section>;
}
