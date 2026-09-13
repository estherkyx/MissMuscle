import test from 'node:test';
import assert from 'node:assert/strict';
import { scanReferenceClip } from './reference-scan';
import { referenceExercisePose } from './exercise-pose';

class ScanVideo extends EventTarget {
  duration=2;videoWidth=300;videoHeight=400;removed=false;paused=false;
  private time=0;
  get currentTime(){return this.time;}
  set currentTime(value:number){this.time=value;queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}
  load(){queueMicrotask(()=>this.dispatchEvent(new Event('loadeddata')));}
  pause(){this.paused=true;}
  removeAttribute(){this.removed=true;}
}
test('preparation scans locally in order, reports progress, releases media and cancels obsolete results',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'document');
  let video=new ScanVideo();
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>video}});
  try {
    for(const id of ['dumbbell_curl','lat_pulldown','leg_extension','dumbbell_front_squat'] as const) {
      video=new ScanVideo();const times:number[]=[],progress:number[]=[];
      const detector={detectForVideo:(_video:unknown,time:number)=>{
        times.push(time);return {landmarks:[referenceExercisePose(id,0.3)].map(p=>p.map(j=>({...j,z:0,visibility:j.visibility??0}))),worldLandmarks:[],segmentationMasks:[],close(){}};
      }};
      const timeline=await scanReferenceClip('blob:local',id,detector,new AbortController().signal,v=>progress.push(v));
      assert.equal(timeline.exerciseId,id);assert.equal(progress.at(-1),1);
      assert.ok(times.every((v,i)=>i===0||v>times[i-1]));
      assert.equal(timeline.samples.length,times.length);
      assert.ok(video.removed&&video.paused);
      const abort=new AbortController();video=new ScanVideo();
      await assert.rejects(scanReferenceClip('blob:obsolete',id,detector,abort.signal,()=>abort.abort()),{name:'AbortError'});
      assert.ok(video.removed&&video.paused);
      video=new ScanVideo();
      await assert.rejects(scanReferenceClip('blob:failed',id,{detectForVideo:()=>{throw new Error('Detector failed');}},new AbortController().signal,()=>{}),/Detector failed/);
      assert.ok(video.removed&&video.paused);
    }
  } finally {
    if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');
  }
});
