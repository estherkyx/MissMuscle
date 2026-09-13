import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFrames } from './media';
import { EXERCISES } from '../../../shared/exercises';

class CaptureVideo extends EventTarget {
  videoWidth=640; videoHeight=480; readyState=2;
  private time=0;
  get currentTime() { return this.time; }
  set currentTime(time:number) { this.time=time; queueMicrotask(()=>this.dispatchEvent(new Event('seeked'))); }
  load() { queueMicrotask(()=>this.dispatchEvent(new Event('loadeddata'))); }
  pause() {}
  removeAttribute() {}
}

test('frame extraction submits the chosen exercise and cancels obsolete work', async () => {
  const original=Object.getOwnPropertyDescriptor(globalThis,'document');
  const video=new CaptureVideo();
  const canvas={width:0,height:0,getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,/9j/2Q=='};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:(name:string)=>name==='video'?video:canvas}});
  try {
    const clip={id:'test-clip',name:'synthetic.mp4',url:'blob:synthetic',durationSec:3,width:640,height:480};
    for(const {id} of EXERCISES) {
      video.currentTime=0;
      const progress:number[]=[];
      const request=await extractFrames(clip,id,new AbortController().signal,n=>progress.push(n));
      assert.equal(request.exerciseId,id);
      assert.equal(request.clipId,clip.id);
      assert.equal(request.frames.length,16);
      assert.equal(progress.at(-1),16);
      assert.ok(request.frames.every((f,i)=>i===0||f.timestampSec>request.frames[i-1].timestampSec));
    }
    const abort=new AbortController();
    await assert.rejects(extractFrames(clip,'leg_extension',abort.signal,()=>abort.abort()),{name:'AbortError'});
    assert.equal(canvas.width,0);
  } finally {
    if(original) Object.defineProperty(globalThis,'document',original);
    else Reflect.deleteProperty(globalThis,'document');
  }
});
