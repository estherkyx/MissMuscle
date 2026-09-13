import type { Landmark } from './muscle-regions';

export type MappedJoint = Landmark & { uncertain?: boolean; opacity?: number; observed?: boolean };
export type FilteredPose = { joints: MappedJoint[]; torsoSize?: number };
export const reliableJoint = (p: Landmark | undefined): p is Landmark => !!p &&
  Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 &&
  p.y >= 0 && p.y <= 1 && (p.visibility ?? 0) >= 0.75;
const trackableJoint = (p: Landmark | undefined): p is Landmark => !!p &&
  Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 &&
  p.y >= 0 && p.y <= 1 && (p.visibility ?? 0) >= 0.5;

// All time-based behavior uses the clip timeline, so pausing freezes the map.
export function createPoseFilter() {
  let history: { joint: Landmark; time: number; candidate?: Landmark }[] = [];
  let previousTime: number | undefined;
  let candidates: (Landmark | undefined)[] = [];
  let torsoSize: number | undefined;
  const reset = () => { history = []; candidates = []; previousTime = undefined; torsoSize = undefined; };
  return {
    reset,
    update(poses: Landmark[][], width: number, height: number, time: number): FilteredPose {
      if (!Number.isFinite(time) || width <= 0 || height <= 0 || poses.length > 1) {
        reset(); return { joints: [] };
      }
      if (previousTime !== undefined && (time < previousTime || time - previousTime > 0.5)) reset();
      const dt = previousTime === undefined ? 0.08 : Math.max(0, time - previousTime);
      previousTime = time;
      const distance = (a: Landmark, b: Landmark) => Math.hypot((a.x-b.x)*width/height, a.y-b.y);
      const input = poses[0] ?? [];
      const joints = Array.from({ length: Math.max(input.length, history.length, candidates.length) }, (_, i): MappedJoint => {
        const p = input[i];
        let state: (typeof history)[number] | undefined = history[i];
        // Do not drag a reacquired joint back toward an expired position.
        if (state && time-state.time > 0.35) state = undefined;
        // The farther arm often has lower visibility. Two consistent current
        // detections can draw it as an uncertain guide, never as reliable anatomy.
        const candidate = candidates[i];
        let accept = reliableJoint(p) || (trackableJoint(p) && !!candidate &&
          distance(p, candidate) < (torsoSize ?? 0.3)*0.3);
        candidates[i] = trackableJoint(p) ? {...p} : undefined;
        if (accept && state && distance(p, state.joint) > (torsoSize ?? 0.3)*0.65) {
          accept = !!state.candidate && distance(p, state.candidate) < (torsoSize ?? 0.3)*0.3;
          state.candidate = {...p};
        } else if (state) state.candidate = undefined;
        if (accept) {
          const alpha = state ? 1-Math.exp(-dt/0.055) : 1;
          const joint = { x: state ? state.joint.x+(p.x-state.joint.x)*alpha : p.x,
            y: state ? state.joint.y+(p.y-state.joint.y)*alpha : p.y, visibility: p.visibility };
          history[i] = { joint, time };
          return { ...joint, observed: true, uncertain: !reliableJoint(p), opacity: reliableJoint(p) ? 1 : 0.8 };
        }
        if (state) {
          const age = time-state.time;
          return { ...state.joint, visibility: 0, uncertain: true, observed: false,
            opacity: Math.max(0, Math.min(1, (0.35-age)/0.2)) };
        }
        return { x: 0, y: 0, visibility: 0, opacity: 0 };
      });
      // Calibrate thickness once from accepted torso joints, never shoulder width
      // (which collapses in side views). Coordinates are in video-height units.
      if (torsoSize === undefined) {
        const lengths = [[11,23], [12,24]].filter(pair => pair.every(i => reliableJoint(joints[i])))
          .map(([a,b]) => distance(joints[a], joints[b])).filter(n => n >= 0.08 && n <= 0.65);
        if (lengths.length) torsoSize = lengths.reduce((a,b) => a+b, 0)/lengths.length;
      }
      return { joints, torsoSize };
    },
  };
}
