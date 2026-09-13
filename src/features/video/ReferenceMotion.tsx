import { useEffect, useRef } from 'react';
import { drawSpatialReference } from './reference-renderer';

import type { ExerciseId } from '../../../shared/contracts';
import { getExercise } from '../../../shared/exercises';
import { type ReferenceView } from './reference-view';
import type { ExerciseMotion } from './exercise-motion';

export function ReferenceMotion({ exerciseId, live = false, view = null, motion = null, status = 'Start body mapping to prepare the reference.' }: { exerciseId: ExerciseId; live?: boolean; view?: ReferenceView | null; motion?: ExerciseMotion | null; status?: string }) {
  const exercise = getExercise(exerciseId)!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d');
    if (!context) return;
    const draw = () => {
      if (!motion || !view) { context.clearRect(0, 0, canvas.width, canvas.height); return; }
      const width = canvas.parentElement!.clientWidth, height = canvas.parentElement!.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
      context.scale(dpr, dpr);
      drawSpatialReference(context, width, height, exerciseId, motion.progress, view.yaw);
    };
    draw();
    const resize = new ResizeObserver(draw);
    resize.observe(canvas.parentElement!);
    return () => resize.disconnect();
  }, [exerciseId, view, motion]);
  return <section className="reference-motion" aria-label={exercise.label + ' reference form animation'}>
    <div className="viewer-heading"><span>03 / Reference form</span><span>{motion ? `${motion.time.toFixed(2)}s / SYNCED` : 'WAITING FOR BODY MAP'}</span></div>
    <div className="mapped-stage">
      <canvas ref={canvasRef} aria-label={'Proper ' + exercise.label + ' form demonstration'} />
      {motion && !view && <div className="mapped-empty"><strong>Facing angle unavailable</strong><p>Keep your shoulders and hips visible to match the reference angle.</p></div>}
      {!motion && <div className="mapped-empty"><strong>{live ? 'Live movement reference' : 'Full-range reference'}</strong><p>{status}</p></div>}
      <span className="reference-phase">{motion ? `${motion.direction} / ${view ? view.held ? 'facing briefly held' : 'approximate facing synced' : 'facing unavailable'}` : live ? 'Reference waits for your movement' : 'Reference waits for your clip'}</span>
    </div>
    <div className="reference-motion-controls">
      <p>{exercise.summary}</p>
      <p>{live ? 'Reference follows your visible curl phase. Timing and facing are approximate.' : 'Full target range · timing matched to your clip. The reference demonstrates complete movement even when your repetition is partial. Use the original video controls to play, pause or seek all three views. Timing and facing are approximate.'}</p>
    </div>
  </section>;
}
