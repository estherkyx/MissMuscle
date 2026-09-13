import type { Landmark } from './muscle-regions';
import { reliableJoint } from './pose-filter';
export type SpatialJoint = Landmark & { z: number };
export type ReferenceView = { yaw: number; held: boolean };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// Anatomical right-to-left is +x in the authored front-facing reference.
export function estimateFacing(pose: Landmark[], world: SpatialJoint[]): number | null {
  const angles: number[] = [];
  for (const [left,right] of [[11,12],[23,24]]) {
    if (![left,right].every(i => reliableJoint(pose[i]) && world[i] &&
      (world[i].visibility ?? 0) >= 0.75 && [world[i].x,world[i].y,world[i].z].every(Number.isFinite))) continue;
    const dx=world[left].x-world[right].x, dz=world[left].z-world[right].z;
    if (Math.hypot(dx,dz) >= 0.05) angles.push(Math.atan2(-dz,dx));
  }
  if (!angles.length || (angles.length===2 && Math.abs(wrap(angles[0]-angles[1]))>Math.PI/3)) return null;
  return Math.atan2(angles.reduce((n,a)=>n+Math.sin(a),0),angles.reduce((n,a)=>n+Math.cos(a),0));
}
export function createFacingTracker() {
  let yaw: number|null=null, previous: number|null=null, reliableTime=-Infinity;
  const reset=()=>{yaw=null;previous=null;reliableTime=-Infinity;};
  return { reset, update(poses: Landmark[][], worlds: SpatialJoint[][], time: number): ReferenceView|null {
    if (!Number.isFinite(time)||poses.length>1||worlds.length>1) {reset();return null;}
    if(previous!==null&&(time<previous||time-previous>0.5)) reset();
    const dt=previous===null?0:time-previous; previous=time;
    const measured=estimateFacing(poses[0]??[],worlds[0]??[]);
    if(measured!==null) {
      yaw=yaw===null||time-reliableTime>0.35?measured:wrap(yaw+wrap(measured-yaw)*(1-Math.exp(-dt/0.08)));
      reliableTime=time;
    }
    return yaw!==null&&time-reliableTime<=0.35?{yaw,held:measured===null}:null;
  }};
}
