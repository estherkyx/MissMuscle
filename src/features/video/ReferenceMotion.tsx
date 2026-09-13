import { useEffect, useRef } from 'react';
import { referenceLoopProgress } from './reference-loop';
import { drawSpatialReference } from './reference-renderer';
import type { ExerciseId } from '../../../shared/contracts';
import { getExercise } from '../../../shared/exercises';
import { type ReferenceView } from './reference-view';
import type { ExerciseMotion } from './exercise-motion';

export function ReferenceMotion({ exerciseId, live = false, loopActive = true, view = null, motion = null, status = 'Start body mapping to prepare the reference.' }: { exerciseId: ExerciseId; live?: boolean; loopActive?: boolean; view?: ReferenceView | null; motion?: ExerciseMotion | null; status?: string }) {
  const exercise = getExercise(exerciseId)!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progress = live ? 0 : motion?.progress ?? 0.5;
  const yaw = live ? (exerciseId === 'leg_extension' ? Math.PI / 2 : exerciseId === 'dumbbell_front_squat' ? Math.PI / 3 : Math.PI / 5) : view?.yaw ?? Math.PI / 5;
  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d');
    if (!context) return;
    let width=0,height=0,animation=0,start:number|undefined,elapsed=0;
    const draw = () => drawSpatialReference(context,width,height,exerciseId,
      live ? referenceLoopProgress(elapsed) : progress,yaw);
    const resizeCanvas = () => {
      width=canvas.parentElement!.clientWidth;height=canvas.parentElement!.clientHeight;
      const dpr=Math.min(window.devicePixelRatio||1,2);
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      context.scale(dpr,dpr);draw();
    };
    const tick = (now:number) => {
      start??=now;elapsed=now-start;draw();animation=requestAnimationFrame(tick);
    };
    resizeCanvas();
    if(live&&loopActive)animation=requestAnimationFrame(tick);
    const resize=new ResizeObserver(resizeCanvas);resize.observe(canvas.parentElement!);
    return () => {resize.disconnect();cancelAnimationFrame(animation);};
  }, [exerciseId, live, loopActive, progress, yaw]);
  return <section className="reference-motion" aria-label={exercise.label + ' reference form animation'}>
    <div className="viewer-heading"><span>03 / Reference form</span><span>{live ? 'LOOPING EXAMPLE' : motion ? `${motion.time.toFixed(2)}s / ${motion.inferred ? 'APPROX. SYNC' : 'SYNCED'}` : 'ILLUSTRATED EXAMPLE'}</span></div>
    <div className="mapped-stage">
      <canvas ref={canvasRef} aria-label={'Proper ' + exercise.label + ' form demonstration'} />
      <span className="reference-phase">{live ? 'Full-range form demonstration' : motion ? `${motion.direction} / ${view ? view.held ? 'facing briefly held' : 'approximate facing synced' : 'example camera angle'}` : 'Full-range reference · waiting for movement'}</span>
    </div>
    {!live && (!motion || (!view && !motion.inferred)) && <div className="reference-motion-controls">
      <p>{!motion ? status :
        'Movement follows your clip · example camera angle.'}</p>
    </div>}
  </section>;
}
