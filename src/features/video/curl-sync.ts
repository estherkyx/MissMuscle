import type { Landmark } from './muscle-regions';
export type CurlMotion = { progress: number; time: number; direction: 'Lifting' | 'Lowering' | 'Holding' };

// Projected elbow bend estimates phase, not clinical joint angles. Lock to one
// visible arm so alternating arms cannot flip the reference timing.
export function createCurlSync() {
  let arm: number[] | undefined;
  let previous: { bend: number; time: number } | undefined;
  return {
    reset() { arm = undefined; previous = undefined; },
    update(poses: Landmark[][], width: number, height: number, time: number): CurlMotion | null {
      const pose = poses.length === 1 ? poses[0] : [];
      const visible = (indices: number[]) => indices.every(i => {
        const p = pose[i];
        return p && (p.visibility ?? 0) >= 0.75 && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
      });
      if (!arm) arm = [[11, 13, 15], [12, 14, 16]].find(visible);
      if (!arm || !visible(arm) || width <= 0 || height <= 0) { previous = undefined; return null; }
      const [s, e, w] = arm.map(i => pose[i]);
      const ax = (s.x-e.x)*width, ay = (s.y-e.y)*height;
      const bx = (w.x-e.x)*width, by = (w.y-e.y)*height;
      const length = Math.hypot(ax, ay)*Math.hypot(bx, by);
      if (Math.min(Math.hypot(ax, ay), Math.hypot(bx, by)) < Math.min(width, height)*0.025) { previous = undefined; return null; }
      const bend = Math.PI - Math.acos(Math.max(-1, Math.min(1, (ax*bx+ay*by)/length)));
      const lift = Math.max(0, Math.min(1, (bend*180/Math.PI-5)/135));
      const delta = previous && time > previous.time && time-previous.time < 0.5 ? bend-previous.bend : 0;
      previous = { bend, time };
      return { progress: lift, time, direction: Math.abs(delta) < 0.015 ? 'Holding' : delta > 0 ? 'Lifting' : 'Lowering' };
    },
  };
}
