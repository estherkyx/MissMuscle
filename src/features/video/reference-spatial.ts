import type { ExerciseId } from '../../../shared/contracts';
import type { SpatialJoint } from './reference-view';

// Educational body-local geometry: +x anatomical left, +y down, -z forward.
export function referenceSpatialPose(id: ExerciseId, progress: number): SpatialJoint[] {
  const t=Math.max(0,Math.min(1,progress));
  const p: SpatialJoint[]=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:0}));
  const put=(i:number,x:number,y:number,z:number)=>{p[i]={x,y,z,visibility:1};};
  for(const s of [0,1]) {
    const sign=s===0?1:-1,x=sign*0.085;
    if(id==='dumbbell_front_squat') {
      const knee=t*0.55,thigh=t*Math.PI/2;
      put(27+s,x,0.89,0);
      put(25+s,x,0.89-Math.cos(knee)*0.22,-Math.sin(knee)*0.22);
      put(23+s,x,p[25+s].y-Math.cos(thigh)*0.24,p[25+s].z+Math.sin(thigh)*0.24);
      put(11+s,sign*0.11,p[23+s].y-0.27*Math.cos(t*0.5),p[23+s].z-0.27*Math.sin(t*0.5));
      put(13+s,sign*0.13,p[11+s].y+0.08,p[11+s].z-0.0975);
      put(15+s,sign*0.13,p[11+s].y-0.025,p[11+s].z-0.01875);
    } else {
      const seated=id!=='dumbbell_curl';
      put(23+s,x,seated?0.58:0.56,0);put(11+s,sign*0.11,seated?0.32:0.26,id==='lat_pulldown'?0.04:0);
      put(25+s,x,seated?0.58:0.73,seated?-0.20:0);
      // Thigh is level; finish three degrees short of a straight knee.
      const angle=id==='leg_extension'?t*(Math.PI/2-Math.PI/60):0;
      put(27+s,x,p[25+s].y+Math.cos(angle)*(seated?0.18:0.17),p[25+s].z-Math.sin(angle)*0.18);
      if(id==='dumbbell_curl') {
        const a=(5+t*135)*Math.PI/180;
        put(13+s,sign*0.13,0.44,0);put(15+s,sign*0.13,0.44+Math.cos(a)*0.17,-Math.sin(a)*0.17);
      } else if(id==='lat_pulldown') {
        // Fixed overhand grip and vertical bar path in front of the face.
        // Equal-length two-bone IK bends elbows outward/down, never behind.
        put(15+s,sign*0.22,0.009+t*0.351,-0.10);
        const shoulder=p[11+s],hand=p[15+s];
        const d={x:hand.x-shoulder.x,y:hand.y-shoulder.y,z:hand.z-shoulder.z};
        const length=Math.hypot(d.x,d.y,d.z),u={x:d.x/length,y:d.y/length,z:d.z/length};
        const seed={x:sign*0.35,y:1,z:0},dot=seed.x*u.x+seed.y*u.y;
        const v={x:seed.x-dot*u.x,y:seed.y-dot*u.y,z:-dot*u.z};
        const vl=Math.hypot(v.x,v.y,v.z),bend=Math.sqrt(0.18**2-(length/2)**2);
        put(13+s,shoulder.x+d.x/2+bend*v.x/vl,shoulder.y+d.y/2+bend*v.y/vl,shoulder.z+d.z/2+bend*v.z/vl);
      } else {
        put(13+s,sign*0.13,0.43,0.01);put(15+s,sign*0.13,0.55,-0.02);
      }
    }
    put(31+s,x,p[27+s].y+0.02,p[27+s].z-0.055);
    const elbow=p[13+s],wrist=p[15+s],forearm=Math.hypot(wrist.x-elbow.x,wrist.y-elbow.y,wrist.z-elbow.z);
    put(19+s,wrist.x+(wrist.x-elbow.x)/forearm*0.018,wrist.y+(wrist.y-elbow.y)/forearm*0.018,wrist.z+(wrist.z-elbow.z)/forearm*0.018);
  }
  put(0,0,(p[11].y+p[12].y)/2-0.10,(p[11].z+p[12].z)/2-0.035);
  return p;
}
export function rotateReferencePoint(p: SpatialJoint,yaw: number): SpatialJoint {
  return {...p,x:p.x*Math.cos(yaw)+p.z*Math.sin(yaw),z:-p.x*Math.sin(yaw)+p.z*Math.cos(yaw)};
}
export function projectReferencePoint(p: SpatialJoint,yaw: number): SpatialJoint {
  const r=rotateReferencePoint(p,yaw);
  return {...r,x:0.5+r.x*4/3*0.85,y:0.08+r.y*0.85};
}
export function referenceEquipment(id: ExerciseId,p: SpatialJoint[]): [SpatialJoint,SpatialJoint][] {
  const lines: [SpatialJoint,SpatialJoint][]=[];
  const offset=(a:SpatialJoint,x:number,y:number,z:number):SpatialJoint=>({...a,x:a.x+x,y:a.y+y,z:a.z+z});
  if(id==='dumbbell_curl'||id==='dumbbell_front_squat') {
    for(const i of [15,16]) {
      lines.push([offset(p[i],-0.035,0,0),offset(p[i],0.035,0,0)]);
      for(const x of [-0.035,0.035]) lines.push([offset(p[i],x,-0.02,0),offset(p[i],x,0.02,0)]);
    }
  } else {
    for(const i of [23,24]) {
      const back=offset(p[i],0,0.025,0.04),front=offset(p[i],0,0.025,-0.20);
      lines.push([back,front],[back,{...back,y:0.80}]);
    }
    if(id==='lat_pulldown') {
      lines.push([p[15],p[16]]);
      const center=offset(p[15],(p[16].x-p[15].x)/2,0,0);
      lines.push([center,{...center,y:0}]);
    } else {
      const pad=(s:number)=>({...p[27+s],y:p[27+s].y+(p[25+s].y-p[27+s].y)*0.1,z:p[27+s].z+(p[25+s].z-p[27+s].z)*0.1});
      lines.push([pad(0),pad(1)]);
      for(const i of [23,24]) lines.push([offset(p[i],0,0.025,0.04),offset(p[i],0,-0.23,0.04)]);
    }
  }
  return lines;
}
