import type { ExerciseId } from '../../../shared/contracts';
import type { Landmark } from './muscle-regions';
import { createCurlSync } from './curl-sync';

export type ExerciseMotion = { progress: number; time: number; direction: string; inferred?: boolean };
export const motionGuidance: Record<ExerciseId, string> = {
  dumbbell_curl: 'Keep your shoulder, elbow and wrist visible.',
  lat_pulldown: 'Keep your hips, shoulders, elbows and wrists visible from a front-side view.',
  leg_extension: 'Use a side view with your hip, knee and ankle visible.',
  dumbbell_front_squat: 'Keep your shoulders, hips, knees and ankles visible from a front-side view.',
};

// Progress drives an illustration only. Projected angles are not form thresholds.
// Keep the selected side until reset; occlusion must not switch reference timing.
export function createExerciseSync(exerciseId: ExerciseId, minVisibility = 0.75) {
  if (exerciseId === 'dumbbell_curl') return createCurlSync(minVisibility);
  let side: number | undefined;
  let previous: { value: number; time: number } | undefined;
  return {
    reset() { side = undefined; previous = undefined; },
    update(poses: Landmark[][], width: number, height: number, time: number): ExerciseMotion | null {
      const p = poses.length === 1 ? poses[0] : [];
      const visible = (indices: number[]) => indices.every(i => p[i] && (p[i].visibility ?? 0) >= minVisibility &&
        Number.isFinite(p[i].x) && Number.isFinite(p[i].y) && p[i].x >= 0 && p[i].x <= 1 && p[i].y >= 0 && p[i].y <= 1);
      const required = (s: number) => exerciseId === 'lat_pulldown' ? [23+s, 11+s, 13+s, 15+s] :
        exerciseId === 'dumbbell_front_squat' ? [11+s, 23+s, 25+s, 27+s] : [23+s, 25+s, 27+s];
      if (side === undefined) side = [0, 1].find(s => visible(required(s)));
      const unavailable = () => { previous = undefined; return null; };
      if (side === undefined || !visible(required(side)) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || !Number.isFinite(time)) return unavailable();
      const indices = exerciseId === 'lat_pulldown' ? [23+side, 11+side, 13+side] : [23+side, 25+side, 27+side];
      const [a,b,c] = indices.map(i => p[i]);
      const ax=(a.x-b.x)*width, ay=(a.y-b.y)*height, bx=(c.x-b.x)*width, by=(c.y-b.y)*height;
      const al=Math.hypot(ax,ay), bl=Math.hypot(bx,by);
      if (Math.min(al,bl) < Math.min(width,height)*0.025) return unavailable();
      const angle=Math.acos(Math.max(-1,Math.min(1,(ax*bx+ay*by)/(al*bl))));
      const value=exerciseId === 'lat_pulldown' ? 1-angle/Math.PI :
        exerciseId === 'leg_extension' ? (angle-Math.PI/2)/(Math.PI/2) : (Math.PI-angle)/(Math.PI/2);
      const delta=previous && time>previous.time && time-previous.time<0.5 ? value-previous.value : 0;
      previous={value,time};
      const labels=exerciseId === 'lat_pulldown' ? ['Pulling','Returning'] : exerciseId === 'leg_extension' ? ['Extending','Returning'] : ['Lowering','Standing'];
      return { progress: Math.max(0,Math.min(1,value)), time, direction: Math.abs(delta)<0.01 ? 'Holding' : labels[delta>0 ? 0 : 1] };
    },
  };
}
