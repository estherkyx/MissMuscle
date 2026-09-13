import type { ExerciseId } from '../../../shared/contracts';
import type { Landmark } from './muscle-regions';
import { referenceCurlPose } from './reference-pose';
import { referenceSpatialPose, projectReferencePoint } from './reference-spatial';

// Same authored geometry as the animated and static reference views.
export function referenceExercisePose(id: ExerciseId, progress: number): Landmark[] {
  if (id === 'dumbbell_curl') return referenceCurlPose(progress);
  const yaw = id === 'lat_pulldown' ? -Math.PI/6 : -Math.PI/2;
  return referenceSpatialPose(id, progress).map(p => projectReferencePoint(p, yaw));
}

export function drawReferenceEquipment(ctx: CanvasRenderingContext2D, id: ExerciseId, pose: Landmark[], width: number, height: number, sourceWidth = 3, sourceHeight = 4) {
  const scale=Math.min(width/sourceWidth,height/sourceHeight), ox=(width-sourceWidth*scale)/2, oy=(height-sourceHeight*scale)/2;
  const point=(i:number)=>({x:ox+pose[i].x*sourceWidth*scale,y:oy+pose[i].y*sourceHeight*scale});
  const required = id === 'lat_pulldown' ? [15,16,23,25] : id === 'leg_extension' ? [23,25,27,28] : [15,16];
  if (!required.every(i => (pose[i]?.visibility ?? 0) >= 0.75)) return;
  ctx.strokeStyle='#aabbbc'; ctx.lineWidth=5; ctx.lineCap='round';
  const line=(a:{x:number;y:number},b:{x:number;y:number})=>{ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();};
  if(id==='lat_pulldown') {
    line(point(15),point(16));
    const center={x:(point(15).x+point(16).x)/2,y:(point(15).y+point(16).y)/2};
    ctx.lineWidth=1; line(center,{x:center.x,y:oy});
  }
  if(id==='lat_pulldown'||id==='leg_extension') {
    const hip=point(23),knee=point(25);
    line({x:hip.x-10,y:hip.y+8},{x:knee.x,y:hip.y+8});
    line({x:hip.x-10,y:hip.y+8},{x:hip.x-10,y:oy+height*0.4});
    if(id==='leg_extension') for(const i of [27,28]) {const a=point(i);line({x:a.x-8,y:a.y-5},{x:a.x+8,y:a.y-5});}
  }
  if(id==='dumbbell_front_squat'||id==='dumbbell_curl') for(const i of [15,16]) {
    const a=point(i);line({x:a.x-9,y:a.y},{x:a.x+9,y:a.y});
    for(const offset of [-9,9]) line({x:a.x+offset,y:a.y-7},{x:a.x+offset,y:a.y+7});
  }
}
