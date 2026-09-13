import type { Landmark } from './muscle-regions';

export const REFERENCE_SECONDS = 6;

// Authored educational animation, never a detected pose or a corrected user frame.
// Same joint layout as the body map; upper arms, shoulders and torso stay fixed.
export function referenceCurlPose(progress: number): Landmark[] {
  const p: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const put = (index: number, x: number, y: number) => { p[index] = { x, y, visibility: 1 }; };
  const phase = Math.max(0, Math.min(1, progress));
  const lift = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  const angle = (15 + lift * 125) * Math.PI / 180;
  put(0, 0.52, 0.15);
  put(11, 0.43, 0.26); put(12, 0.61, 0.26);
  put(23, 0.46, 0.56); put(24, 0.59, 0.56);
  put(25, 0.45, 0.73); put(26, 0.61, 0.73);
  put(27, 0.44, 0.90); put(28, 0.62, 0.90);
  put(31, 0.38, 0.92); put(32, 0.56, 0.92);
  for (const [elbow, wrist, hand, x] of [[13, 15, 19, 0.40], [14, 16, 20, 0.64]]) {
    put(elbow, x, 0.44);
    // The normalized canvas is 3:4, so correct x for equal screen-space lengths.
    const dx = -Math.sin(angle) * 0.17 * 4 / 3, dy = Math.cos(angle) * 0.17;
    put(wrist, x + dx, 0.44 + dy);
    put(hand, x + dx * 1.16, 0.44 + dy * 1.16);
  }
  return p;
}
