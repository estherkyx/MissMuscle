import type { FilteredPose, MappedJoint } from './pose-filter';

type BodySample = { time: number; body: FilteredPose; multiple: boolean };
const observed = (p: MappedJoint | undefined): p is MappedJoint => !!p &&
  (p.observed === true || (!p.uncertain && (p.visibility ?? 0) >= 0.75));
const visible = (p: MappedJoint | undefined): p is MappedJoint => !!p &&
  (p.opacity ?? ((p.visibility ?? 0) >= 0.5 ? 1 : 0)) > 0;

// Offline interpolation can use both sides of a short occlusion. Keep inference
// separate from observations, never copy the other arm or cross multiple people.
export function bridgeBodyGaps<T extends BodySample>(input: T[]): T[] {
  const samples = input.map(s => ({...s,body:{...s.body,joints:s.body.joints.map(p=>({...p}))}}));
  const count = Math.max(0,...samples.map(s=>s.body.joints.length));
  for (let joint=0;joint<count;joint++) {
    let previous = -1;
    for (let i=0;i<samples.length;i++) {
      if (samples[i].multiple || (i>0 && samples[i].time-samples[i-1].time>0.15)) previous=-1;
      if (samples[i].multiple || !observed(samples[i].body.joints[joint])) continue;
      if (previous>=0 && i>previous+1 && samples[i].time-samples[previous].time<=0.6+1e-7) {
        const a=samples[previous],b=samples[i],p=a.body.joints[joint],q=b.body.joints[joint];
        for (let k=previous+1;k<i;k++) {
          const t=(samples[k].time-a.time)/(b.time-a.time);
          samples[k].body.joints[joint]={x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,
            visibility:0,uncertain:true,observed:false,opacity:0.8};
        }
      }
      previous=i;
    }
  }
  return samples;
}

// Monotone cubic interpolation smooths velocity without overshooting joint
// positions. Turning points have zero velocity instead of a sharp reversal.
function coordinate(samples: BodySample[], index: number, joint: number, axis: 'x'|'y', t: number) {
  const a=samples[index],b=samples[index+1],p=a.body.joints[joint],q=b.body.joints[joint];
  const dt=b.time-a.time, slope=(q[axis]-p[axis])/dt;
  const tangent=(neighbor: BodySample|undefined, anchor: BodySample, point: MappedJoint) => {
    const n=neighbor?.body.joints[joint];
    if (!neighbor || neighbor.multiple || !visible(n) || Math.abs(neighbor.time-anchor.time)>0.15) return slope;
    const other=(n[axis]-point[axis])/(neighbor.time-anchor.time);
    return slope*other<=0 ? 0 : 2*slope*other/(slope+other);
  };
  const m0=tangent(samples[index-1],a,p)*dt,m1=tangent(samples[index+2],b,q)*dt;
  return (2*t**3-3*t*t+1)*p[axis]+(t**3-2*t*t+t)*m0+(-2*t**3+3*t*t)*q[axis]+(t**3-t*t)*m1;
}

export function interpolateBody(samples: BodySample[], index: number, t: number): FilteredPose {
  const a=samples[index],b=samples[index+1];
  if (a.multiple) return {joints:[]};
  if (!b || t===0 || b.multiple || b.time-a.time>0.15) return a.body;
  return {torsoSize:a.body.torsoSize,joints:Array.from({length:Math.max(a.body.joints.length,b.body.joints.length)},(_,i)=>{
    const p=a.body.joints[i],q=b.body.joints[i];
    if (!visible(p) && !visible(q)) return p ?? q;
    const from=visible(p)?p:q,to=visible(q)?q:p;
    const uncertain=!!p?.uncertain||!!q?.uncertain||!visible(p)||!visible(q);
    return {...from,
      x:visible(p)&&visible(q)?coordinate(samples,index,i,'x',t):from.x,
      y:visible(p)&&visible(q)?coordinate(samples,index,i,'y',t):from.y,
      visibility:uncertain?0:Math.min(from.visibility??0,to.visibility??0),uncertain,
      observed:!uncertain,
      opacity:(visible(p)?p.opacity??1:0)*(1-t)+(visible(q)?q.opacity??1:0)*t};
  })};
}
