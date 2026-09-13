import type { ExerciseId } from '../../../shared/contracts';
import type { Landmark } from './muscle-regions';
import { containRect } from './muscle-regions';
import type { FilteredPose } from './pose-filter';
const isVisibleJoint = (point: Landmark | undefined): point is Landmark => !!point &&
  Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 && (point.visibility ?? 0) >= 0.75;

// An illustrative 2D body driven by detected joints, not a reconstructed anatomy.
export function drawMappedBody(ctx: CanvasRenderingContext2D, width: number, height: number, videoWidth: number, videoHeight: number, poses: Landmark[][], exerciseId: ExerciseId = 'dumbbell_curl', filtered?: FilteredPose) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#101515'; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  if (poses.length !== 1) return;
  const rect = containRect(width, height, videoWidth, videoHeight);
  const pose = filtered?.joints ?? poses[0];
  const point = (index: number) => ({ x: rect.x + pose[index].x * rect.width, y: rect.y + pose[index].y * rect.height });
  const estimated = (...indices: number[]) => indices.some(i => filtered?.joints[i]?.uncertain);
  const opacity = (...indices: number[]) => Math.min(...indices.map(i => filtered?.joints[i]?.opacity ?? 1));
  const visible = (...indices: number[]) => indices.every(i => isVisibleJoint(pose[i]) ||
    (filtered?.joints[i]?.uncertain && (filtered.joints[i].opacity ?? 0) > 0));
  const size = filtered
    ? Math.max(5, Math.min(rect.height * (filtered.torsoSize ?? 0.3) * 0.16, Math.min(width, height)*0.09))
    : visible(11, 12) ? Math.max(12, Math.min(width * 0.09, Math.hypot(point(11).x - point(12).x, point(11).y - point(12).y) * 0.21)) : width * 0.045;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  function segment(a: number, b: number, thickness: number, color = '#424a4b') {
    if (!visible(a, b)) return;
    const start = point(a), end = point(b);
    ctx.save();
    if (estimated(a, b)) { ctx.globalAlpha = 0.55 * opacity(a, b); ctx.setLineDash([6, 5]); color = '#a9b7bc'; }
    ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = '#9ba6a6'; ctx.lineWidth = thickness + 2; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.stroke();
    ctx.restore();
  }
  function muscle(a: number, b: number, color: string, thickness: number) {
    if (!visible(a, b) || estimated(a, b)) return;
    const start = point(a), end = point(b);
    ctx.beginPath(); ctx.moveTo(start.x * 0.78 + end.x * 0.22, start.y * 0.78 + end.y * 0.22);
    ctx.lineTo(start.x * 0.25 + end.x * 0.75, start.y * 0.25 + end.y * 0.75);
    ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.stroke();
  }
  if (visible(11, 12, 23, 24)) {
    ctx.save();
    if (estimated(11, 12, 23, 24)) ctx.globalAlpha = 0.55 * opacity(11, 12, 23, 24);
    ctx.beginPath(); [11, 12, 24, 23].forEach((index, i) => { const p = point(index); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.closePath(); ctx.fillStyle = '#363e3f'; ctx.fill(); ctx.strokeStyle = '#8c9898'; ctx.lineWidth = 2; ctx.stroke();
    const top = { x: (point(11).x + point(12).x) / 2, y: (point(11).y + point(12).y) / 2 };
    const bottom = { x: (point(23).x + point(24).x) / 2, y: (point(23).y + point(24).y) / 2 };
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bottom.x, bottom.y); ctx.strokeStyle = '#101515'; ctx.stroke();
    ctx.restore();
  }
  for (const [a, b] of [[23, 25], [24, 26], [25, 27], [26, 28]]) segment(a, b, size * 1.15);
  for (const [a, b] of [[11, 13], [12, 14], [13, 15], [14, 16]]) segment(a, b, size);
  if (exerciseId === 'dumbbell_curl' || exerciseId === 'lat_pulldown') {
    for (const [a,b] of [[11,13],[12,14]]) muscle(a,b,exerciseId === 'dumbbell_curl' ? '#ed383e' : '#f6c744',size*0.78);
    for (const [a,b] of [[13,15],[14,16]]) muscle(a,b,'#f6c744',size*0.65);
  }
  // Torso-side and hip patches are approximate educational areas, not segmentation.
  if (exerciseId === 'lat_pulldown' && visible(11,12,23,24)) {
    for (const [a,b] of [[11,23],[12,24]]) muscle(a,b,'#ed383e',size*0.8);
  }
  if (exerciseId === 'leg_extension' || exerciseId === 'dumbbell_front_squat') {
    for (const [a,b] of [[23,25],[24,26]]) muscle(a,b,'#ed383e',size*0.95);
  }
  if (exerciseId === 'dumbbell_front_squat') {
    for (const [a,b] of [[23,25],[24,26]]) {
      if (!visible(a,b) || estimated(a,b)) continue;
      const hip=point(a), knee=point(b);
      ctx.beginPath();ctx.ellipse(hip.x*0.9+knee.x*0.1,hip.y*0.9+knee.y*0.1,size*0.65,size*0.8,0,0,Math.PI*2);
      ctx.fillStyle='#ed383e';ctx.fill();
    }
  }
  for (const [a, b] of [[15, 19], [16, 20], [27, 31], [28, 32]]) segment(a, b, size * 0.65);
  if (visible(0, 11, 12)) {
    ctx.save();
    if (estimated(0, 11, 12)) ctx.globalAlpha = 0.55 * opacity(0, 11, 12);
    const nose = point(0);
    ctx.beginPath(); ctx.ellipse(nose.x, nose.y, size * 0.82, size * 1.08, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#424a4b'; ctx.fill(); ctx.strokeStyle = '#9ba6a6'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  for (const index of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    if (!visible(index) || estimated(index)) continue;
    const p = point(index); ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fillStyle = '#d4dfdc'; ctx.fill();
  }
}
