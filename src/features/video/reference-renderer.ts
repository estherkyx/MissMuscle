import type { ExerciseId } from '../../../shared/contracts';
import { containRect } from './muscle-regions';
import { projectReferencePoint, referenceEquipment, referenceSpatialPose } from './reference-spatial';
import type { SpatialJoint } from './reference-view';

export function drawSpatialReference(ctx: CanvasRenderingContext2D,width: number,height: number,id: ExerciseId,progress: number,yaw: number) {
  ctx.clearRect(0,0,width,height);ctx.fillStyle='#101515';ctx.fillRect(0,0,width,height);
  const rect=containRect(width,height,3,4), authored=referenceSpatialPose(id,progress);
  const screen=(p:SpatialJoint)=>{const q=projectReferencePoint(p,yaw);return {...q,x:rect.x+q.x*rect.width,y:rect.y+q.y*rect.height};};
  const pose=authored.map(screen), size=rect.height*0.034;
  const commands: {depth:number;draw:()=>void}[]=[];
  const line=(a:SpatialJoint,b:SpatialJoint,thickness:number,color:string)=>{
    commands.push({depth:(a.z+b.z)/2,draw:()=>{
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
      ctx.lineCap='round';ctx.strokeStyle='#9ba6a6';ctx.lineWidth=thickness+1.5;ctx.stroke();
      ctx.strokeStyle=color;ctx.lineWidth=thickness;ctx.stroke();
    }});
  };
  for(const [a,b] of [[23,25],[24,26],[25,27],[26,28],[11,13],[12,14],[13,15],[14,16],[15,19],[16,20],[27,31],[28,32]]) {
    const arm=a>=11&&a<=14, thigh=a===23||a===24;
    const primary=(id==='dumbbell_curl'&&(a===11||a===12))||((id==='leg_extension'||id==='dumbbell_front_squat')&&thigh);
    const supporting=arm&&(id==='dumbbell_curl'||id==='lat_pulldown');
    line(pose[a],pose[b],size*(a>=27||a===15||a===16?0.65:1),primary?'#ed383e':supporting?'#f6c744':'#424a4b');
  }
  commands.push({depth:(pose[11].z+pose[12].z+pose[23].z+pose[24].z)/4,draw:()=>{
    ctx.beginPath();[11,12,24,23].forEach((i,n)=>{const p=pose[i];if(n)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});
    ctx.closePath();ctx.fillStyle='#363e3f';ctx.fill();ctx.strokeStyle='#8c9898';ctx.lineWidth=1.5;ctx.stroke();
  }});
  if(id==='lat_pulldown') for(const [a,b] of [[11,23],[12,24]]) line(pose[a],pose[b],size*0.7,'#ed383e');
  commands.push({depth:pose[0].z,draw:()=>{
    ctx.beginPath();ctx.ellipse(pose[0].x,pose[0].y,size*0.82,size*1.08,0,0,Math.PI*2);
    ctx.fillStyle='#424a4b';ctx.fill();ctx.strokeStyle='#9ba6a6';ctx.lineWidth=1.5;ctx.stroke();
  }});
  for(const [a,b] of referenceEquipment(id,authored)) line(screen(a),screen(b),Math.max(2,size*0.22),'#aabbbc');
  // Larger world z is farther from the camera.
  commands.sort((a,b)=>b.depth-a.depth).forEach(command=>command.draw());
}
