import type { ExerciseId } from '../../../shared/contracts';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { waitForMedia, validateDuration } from './media';
import { createExerciseSync } from './exercise-motion';
import { createPoseFilter } from './pose-filter';
import { createFacingTracker } from './reference-view';
import { buildReferenceTimeline, type ReferenceSample } from './reference-timeline';

export function scanTimes(duration: number) {
  validateDuration(duration);
  const end=Math.max(0,duration-0.01);
  const times=Array.from({length:Math.floor(end*10)+1},(_,i)=>i/10);
  if(end-times[times.length-1]>0.001) times.push(end);
  return times;
}

// Separate video and tracker: preparation never seeks the visible player.
export async function scanReferenceClip(source: string, exerciseId: ExerciseId, detector: Pick<PoseLandmarker,'detectForVideo'>, signal: AbortSignal, progress: (value:number)=>void) {
  const video=document.createElement('video');
  video.muted=true;video.playsInline=true;video.preload='auto';
  const filter=createPoseFilter(),facing=createFacingTracker(),sync=createExerciseSync(exerciseId);
  const samples: ReferenceSample[]=[];
  try {
    await waitForMedia(video,'loadeddata',signal,()=>{video.src=source;video.load();});
    const times=scanTimes(video.duration);
    for(let i=0;i<times.length;i++) {
      signal.throwIfAborted();
      const time=times[i];
      if(Math.abs(video.currentTime-time)>0.001) await waitForMedia(video,'seeked',signal,()=>{video.currentTime=time;});
      signal.throwIfAborted();
      const result=detector.detectForVideo(video,time*1000);
      try {
        const multiple=result.landmarks.length>1;
        const body=filter.update(result.landmarks,video.videoWidth,video.videoHeight,time);
        const motion=sync.update(multiple?result.landmarks:result.landmarks.length?[body.joints]:[],video.videoWidth,video.videoHeight,time);
        const radians=exerciseId==='dumbbell_curl'?135*Math.PI/180:exerciseId==='lat_pulldown'?Math.PI:Math.PI/2;
        samples.push({time,body,multiple,value:motion?motion.progress*radians:null,
          view:facing.update(result.landmarks,result.worldLandmarks,time)});
      } finally { result.close(); }
      progress((i+1)/times.length);
      // Yield for paint and cancellation even on very fast cached seeks.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    signal.throwIfAborted();
    return buildReferenceTimeline(exerciseId,samples);
  } finally { video.pause();video.removeAttribute('src');video.load(); }
}
