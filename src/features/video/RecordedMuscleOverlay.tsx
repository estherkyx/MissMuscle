import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPoseWorker, type PoseWorkerClient } from './pose-worker-client';
import { drawMappedBody } from './mapped-body';
import { type FilteredPose } from './pose-filter';
import { ReferenceMotion } from './ReferenceMotion';
import { type ReferenceView } from './reference-view';
import { motionGuidance, type ExerciseMotion } from './exercise-motion';
import { scanReferenceClip } from './reference-scan';
import { referenceAt, type ReferenceTimeline } from './reference-timeline';
import type { ExerciseId } from '../../../shared/contracts';

export function RecordedMuscleOverlay({ videoRef, exerciseId, enabled }: { videoRef: RefObject<HTMLVideoElement | null>; exerciseId: ExerciseId; enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const [mapped, setMapped] = useState(false);
  const [time, setTime] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [sourceRevision, setSourceRevision] = useState(0);
  const [referenceStatus, setReferenceStatus] = useState('Start body mapping to prepare the reference.');
  const [motion, setMotion] = useState<ExerciseMotion | null>(null);

  const [referenceView, setReferenceView] = useState<ReferenceView | null>(null);

  useEffect(() => {
    setMapped(false); setMotion(null);
    if (!enabled) return;
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    const controller=new AbortController();
    let disposed=false, detector: PoseWorkerClient|undefined, animation=0;
    let timeline: ReferenceTimeline|undefined,lastTime=-1;
    let current: FilteredPose={joints:[]};
    const clear=()=>canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
    const draw=()=>{
      const context=canvas.getContext('2d');
      if(!context) throw new Error('Canvas unavailable');
      const width=canvas.parentElement!.clientWidth,height=canvas.parentElement!.clientHeight;
      const dpr=Math.min(window.devicePixelRatio||1,2);
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context.scale(dpr,dpr);
      drawMappedBody(context,width,height,video.videoWidth,video.videoHeight,[current.joints],exerciseId,current);
    };
    const hide=()=>{current={joints:[]};clear();setMapped(false);setMotion(null);setReferenceView(null);lastTime=-1;};
    const replace=()=>{controller.abort();hide();setSourceRevision(n=>n+1);};
    const seek=()=>{hide();};
    const fail=()=>{
      if(disposed) return;
      controller.abort();hide();setPreparing(false);setFailed(true);
      setStatus('Body tracking is unavailable. Stop and start mapping to retry.');
      setReferenceStatus('Clip synchronization failed. Stop and start mapping to retry.');
    };
    function tick() {
      if(disposed) return;
      try {
        if(timeline&&!video!.seeking&&video!.readyState>=2&&video!.currentTime!==lastTime) {
          lastTime=video!.currentTime;
          const frame=referenceAt(timeline,lastTime);current=frame.body;draw();
          const hasPose=current.joints.some(p=>(p.opacity??0)>0);
          setMapped(hasPose);setTime(lastTime);setMotion(frame.motion);setReferenceView(frame.view);
          setReferenceStatus(frame.multiple?'Multiple people visible. Use a clip with one person.':
            !timeline.spans.length?'Repetition timing could not be determined from this clip.':
            'Movement timing is uncertain at this point in your clip.');
          setStatus(frame.multiple?'Multiple people visible. Use a clip with one person.':
            hasPose?'':motionGuidance[exerciseId]);
        }
        animation=requestAnimationFrame(tick);
      } catch {fail();}
    }
    async function prepare() {
      video!.pause();hide();setFailed(false);setPreparing(true);setScanProgress(0);
      setStatus('Loading body tracker...');setReferenceStatus('Preparing full-range reference...');
      const timeout=window.setTimeout(()=>{if(!disposed)fail();},30_000);
      try {
        detector=await createPoseWorker(controller.signal);
        controller.signal.throwIfAborted();window.clearTimeout(timeout);
        setStatus('Scanning the clip to match reference timing...');
        timeline=await scanReferenceClip(video!.currentSrc||video!.src,exerciseId,detector,controller.signal,value=>{
          if(!disposed&&!controller.signal.aborted)setScanProgress(value);
        });
        controller.signal.throwIfAborted();
        setPreparing(false);setStatus('Preparation complete. Play or seek your clip.');
        animation=requestAnimationFrame(tick);
      } catch { if(!controller.signal.aborted)fail(); }
      finally {window.clearTimeout(timeout);detector?.close();detector=undefined;}
    }
    video.addEventListener('seeking',seek);
    video.addEventListener('emptied',replace);video.addEventListener('loadstart',replace);
    const resize=new ResizeObserver(()=>{if(!disposed&&timeline)draw();});resize.observe(canvas.parentElement!);
    void prepare();
    return ()=>{
      disposed=true;controller.abort();cancelAnimationFrame(animation);timeline=undefined;
      video.removeEventListener('seeking',seek);video.removeEventListener('emptied',replace);video.removeEventListener('loadstart',replace);
      resize.disconnect();clear();
    };
  }, [enabled, videoRef, exerciseId, sourceRevision]);

  return <>
    <ReferenceMotion exerciseId={exerciseId} status={enabled ? referenceStatus : 'Start body mapping to prepare the reference.'}
      view={enabled && !failed ? referenceView : null} motion={enabled && !failed ? motion : null} />
    <div className="mapped-view">
      <div className="viewer-heading"><span>02 / Body map</span><span>{enabled && mapped ? `${time.toFixed(2)}s / SYNCED` : '2D POSE'}</span></div>
      <div className="mapped-stage">
        <canvas ref={canvasRef} aria-label="Moving body visualization with educational muscle target colors" />
        {(!enabled || !mapped || failed) && <div className="mapped-empty"><span aria-hidden="true">?</span>
          <strong>{!enabled ? 'See your movement mapped' : failed ? 'Mapping unavailable' : preparing ? 'Preparing body mapping' : 'Waiting for a visible pose'}</strong>
          <p>{!enabled ? 'Prepare once, then play, pause and seek your clip with the body map and full-range reference.' : status}</p>
        </div>}
      </div>
    </div>
    <div className="muscle-overlay-controls">
      <div className="heatmap-legend"><span><i className="heat-primary" />Primary targets</span><span><i className="heat-secondary" />Supporting muscles</span><span><i className="heat-other" />Other areas</span></div>
      {enabled && preparing && <progress aria-label="Preparing body mapping" value={scanProgress} max={1} />}
      {enabled && status && <p role="status" className={failed ? 'error' : 'muted'}>{status}</p>}
    </div>
  </>;
}
