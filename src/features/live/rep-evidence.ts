import type { ExerciseId } from '../../../shared/contracts';
import type { RepTiming } from './rep-activity';

export function needsRepEndpoint(exerciseId: ExerciseId): boolean {
  return exerciseId === 'dumbbell_front_squat' || exerciseId === 'leg_extension';
}

// Select real camera samples around a tracked reversal. Pose progress locates
// candidate moments only; the visual provider still assesses movement range.
export function selectRepEvidence<T extends { time: number }>(frames: T[], rep: RepTiming): T[] | null {
  if(![rep.startSec,rep.peakSec,rep.returnSec].every(Number.isFinite)||
    rep.startSec>=rep.peakSec||rep.peakSec>=rep.returnSec)return null;
  const available=frames.filter(frame=>frame.time>=rep.startSec-0.45&&frame.time<=rep.returnSec+0.25);
  const nearest=(time:number)=>available.reduce((best,frame,index)=>
    best<0||Math.abs(frame.time-time)<Math.abs(available[best].time-time)?index:best,-1);
  const first=nearest(rep.startSec),peak=nearest(rep.peakSec),last=nearest(rep.returnSec);
  if(first<0||first>=peak||peak>=last||
    Math.abs(available[first].time-rep.startSec)>0.45||
    Math.abs(available[peak].time-rep.peakSec)>0.3||
    Math.abs(available[last].time-rep.returnSec)>0.45)return null;
  const selected=new Set([first,peak,last]);
  // One additional approaching/returning moment helps establish direction.
  const longest=peak-first>=last-peak?[first,peak]:[peak,last];
  selected.add(Math.floor((longest[0]+longest[1])/2));
  return [...selected].sort((a,b)=>a-b).map(index=>available[index]);
}
