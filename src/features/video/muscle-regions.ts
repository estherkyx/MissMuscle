export type Landmark = { x: number; y: number; visibility?: number };
export type MuscleRegion = { label: string; color: string; points: Landmark[] };
const mix = (a: Landmark, b: Landmark, t: number): Landmark => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const visible = (p: Landmark | undefined): p is Landmark => !!p &&
  Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && (p.visibility ?? 0) >= 0.75;

// Educational placement from joints, not muscle segmentation or activation.
export function muscleRegions(poses: Landmark[][]): MuscleRegion[] {
  if (poses.length !== 1) return []; // Never silently choose between people.
  const p = poses[0];
  const regions: MuscleRegion[] = [];
  for (const [shoulder, elbow] of [[11, 13], [12, 14]]) {
    if (visible(p[shoulder]) && visible(p[elbow])) {
      regions.push({ label: 'Shoulder', color: '#7dd3fc', points: [mix(p[shoulder], p[elbow], 0.08)] });
      regions.push({ label: 'Biceps area', color: '#fcd34d', points: [mix(p[shoulder], p[elbow], 0.28), mix(p[shoulder], p[elbow], 0.72)] });
    }
  }
  // Only show front-torso guides for a reasonably frontal, face-visible view.
  // This conservative heuristic is not an anatomical orientation measurement.
  if ([0, 11, 12, 23, 24].every(i => visible(p[i])) && p[11].x > p[12].x) {
    const top = mix(p[11], p[12], 0.5), bottom = mix(p[23], p[24], 0.5);
    const width = Math.abs(p[11].x - p[12].x);
    if (width > 0.08 && width > Math.hypot(top.x - bottom.x, top.y - bottom.y) * 0.45) {
      for (const [label, color, start, end, inset] of [
        ['Chest area', '#c4b5fd', 0.15, 0.38, 0.15],
        ['Abs area', '#6ee7b7', 0.43, 0.86, 0.3],
      ] as const) {
        const leftTop = mix(p[11], p[23], start), rightTop = mix(p[12], p[24], start);
        const leftBottom = mix(p[11], p[23], end), rightBottom = mix(p[12], p[24], end);
        regions.push({ label, color, points: [mix(leftTop, rightTop, inset), mix(rightTop, leftTop, inset), mix(rightBottom, leftBottom, inset), mix(leftBottom, rightBottom, inset)] });
      }
    }
  }
  return regions;
}

export function containRect(boxWidth: number, boxHeight: number, videoWidth: number, videoHeight: number) {
  const scale = Math.min(boxWidth / videoWidth, boxHeight / videoHeight);
  const width = videoWidth * scale, height = videoHeight * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}
