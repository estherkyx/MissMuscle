import { needsRepEndpoint } from './rep-evidence';
import { createExerciseSync } from '../video/exercise-motion';
import type { ExerciseId } from '../../../shared/contracts';
import type { Landmark } from '../video/muscle-regions';

export interface RepTiming { startSec: number; peakSec: number; returnSec: number }

// A replay boundary heuristic, not a form assessment or an exact rep counter.
// Require an exercise excursion followed by its return; walking/reaching alone
// should not replace the retained exercise clip. Either visible side can qualify.
export function createRepActivity(exerciseId: ExerciseId = 'dumbbell_curl') {
  let latestRep: RepTiming | undefined;
  const sides = [0, 1].map(side => ({
    side, sync: createExerciseSync(exerciseId),
    positions: [] as Array<{ time: number; x: number; y: number; size: number }>,
    state: undefined as { low: number; lowTime: number; peak: number; peakTime: number; last: number; time: number; started: number; x: number; y: number; size: number; returning: boolean } | undefined,
  }));
  return {
    get latestRep() { return latestRep; },
    update(poses: Landmark[][], width: number, height: number, time: number): boolean {
      let active = false;
      for (const arm of sides) {
        const pose = poses.length === 1 ? poses[0] : [];
        // Hide the other side so phase never changes sides halfway through a rep.
        const other=[11,13,15,23,25,27].map(index=>index+1-arm.side);
        const single = pose.map((point, index) => other.includes(index) ? { ...point, visibility: 0 } : point);
        let motion = arm.sync.update(single.length ? [single] : [], width, height, time);
        let squatScale: number | undefined;
        if (exerciseId === 'dumbbell_front_squat') {
          const joints = [11,23,25,27].map(index => pose[index+arm.side]);
          const visible = width>0 && height>0 && Number.isFinite(width) && Number.isFinite(height) &&
            joints.every(p => p && (p.visibility??0)>=0.75 && Number.isFinite(p.x) && Number.isFinite(p.y) &&
              p.x>=0 && p.x<=1 && p.y>=0 && p.y<=1);
          if (visible) {
            const [shoulder,hip,,ankle] = joints;
            squatScale = Math.hypot((shoulder.x-hip.x)*width,(shoulder.y-hip.y)*height);
            if (squatScale < Math.min(width,height)*0.05) { motion=null; squatScale=undefined; }
            else {
              // Facing the camera, hips/knees/ankles can remain collinear on
              // screen throughout a squat. Hip travel relative to a planted
              // ankle preserves its turnaround even when the projected thigh
              // disappears. Combine this with the side-view timing signal.
              // Keep scale fixed within the candidate so a torso bow alone
              // cannot masquerade as hip travel. This never grades squat depth.
              const hipTravel = (hip.y-ankle.y)*height/(arm.state?.size??squatScale);
              motion={ progress:(motion?.progress??0)+hipTravel, time, direction:'Tracking' };
            }
          } else motion=null;
        }
        if (!motion || !Number.isFinite(time)) { arm.state = undefined; arm.positions = []; arm.sync.reset(); continue; }
        // Use the part that stays in place for this exercise. A squat's hips
        // must move; its planted ankle is the appropriate movement anchor.
        const anchors=exerciseId==='dumbbell_curl'?[11,13]:exerciseId==='lat_pulldown'?[23,11]:
          exerciseId==='leg_extension'?[23,25]:[27,25];
        const anchor = pose[anchors[0]+arm.side], endpoint = pose[anchors[1]+arm.side];
        const x = anchor.x * width, y = anchor.y * height;
        const size = squatScale ?? Math.hypot(x - endpoint.x * width, y - endpoint.y * height);
        arm.positions = arm.positions.filter(point => time > point.time && time - point.time <= 1);
        arm.positions.push({ time, x, y, size });
        const position = arm.positions[0];
        // Keep this history across rejected candidates: repeatedly resetting a
        // candidate while approaching the camera must not turn a reach into a rep.
        if (time - position.time >= 0.5 && (Math.hypot(x - position.x, y - position.y) > position.size * 0.4 ||
          size / position.size < 0.84 || size / position.size > 1.18)) {
          arm.state = undefined;
          continue;
        }
        const prior = arm.state;
        if (!prior || time <= prior.time || time - prior.time > 0.75 || time - prior.started > 20 ||
          Math.hypot(x - prior.x, y - prior.y) > prior.size * 0.6 || size / prior.size < 0.7 || size / prior.size > 1.3) {
          arm.state = { low: motion.progress, lowTime: time, peak: motion.progress, peakTime: time, last: motion.progress, time, started: time, x, y, size, returning: false };
          continue;
        }
        prior.time = time;
        let advanced=false;
        if (!prior.returning) {
          if(motion.progress<=prior.low+0.005)prior.lowTime=time;
          prior.low = Math.min(prior.low, motion.progress);
          if(motion.progress>prior.peak)prior.peakTime=time;
          prior.peak = Math.max(prior.peak, motion.progress);
          // Small range excursions are still useful review candidates. This
          // selects evidence only; it never grades form from a projected angle.
          const excursion=exerciseId==='dumbbell_front_squat'?0.04:needsRepEndpoint(exerciseId)?0.1:0.22;
          const reversal=exerciseId==='dumbbell_front_squat'?0.02:needsRepEndpoint(exerciseId)?0.05:0.12;
          if (prior.peak - prior.low >= excursion && prior.peak - motion.progress >= reversal) {
            prior.returning = true;
            prior.last = motion.progress;
            active = true;
            advanced=true;
          }
        } else if (motion.progress < prior.last - 0.008) {
          active = true;
          advanced=true;
          prior.last = motion.progress;
        }
        if(advanced&&prior.lowTime<prior.peakTime&&prior.peakTime<time&&
          (!latestRep||prior.peakTime>=latestRep.peakSec)) {
          latestRep={startSec:prior.lowTime,peakSec:prior.peakTime,returnSec:time};
        }
        // Front-facing shallow reps have a small timing excursion. A fixed
        // return tolerance would finish them halfway through the rise.
        const returned=exerciseId==='dumbbell_front_squat'?Math.min(0.06,(prior.peak-prior.low)*0.1):0.06;
        if (prior.returning && motion.progress <= prior.low + returned) arm.state = undefined;
      }
      return active;
    },
  };
}
