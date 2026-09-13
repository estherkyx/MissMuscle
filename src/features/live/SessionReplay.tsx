import { useEffect, useRef, useState } from 'react';
import { segmentAt, type RecordingWindow } from './recording';
import { CRITERIA, correctionReplayOffset, type SavedCorrection } from './findings';
import { createReplayResources } from './replay-resources';

function ReplayPlayer({ recording, seekSec }: { recording: RecordingWindow; seekSec: { time: number; nonce: number; play?: boolean } }) {
  const video = useRef<HTMLVideoElement>(null);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef({ time: recording.startSec, play: false });
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    const resources = createReplayResources(recording);
    setUrls(resources.urls);
    return () => resources.release();
  }, [recording]);
  const [segmentId, setSegmentId] = useState('');
  const segment = recording.segments.find(s => s.id === segmentId);
  const activeSegment = useRef(segment); activeSegment.current = segment;
  function seek(absolute: number, play = false) {
    const time = Math.max(recording.startSec, Math.min(recording.endSec - 0.001, absolute));
    const target = segmentAt(recording.segments, time);
    if (!target) { setError('This moment could not be recorded.'); return; }
    setError(''); pending.current = { time, play }; setPosition(time - recording.startSec);
    if (target.id === activeSegment.current?.id && video.current?.readyState) {
      video.current.currentTime = Math.max(0, time - target.startSec);
      if (play) void video.current.play().catch(() => setError('Press Play to start replay.')); else video.current.pause();
    } else setSegmentId(target.id);
  }
  useEffect(() => { seek(recording.startSec + seekSec.time, seekSec.play); }, [recording, seekSec]); // eslint-free: seeking is driven by explicit review selection.
  const duration = Math.max(0, recording.endSec - recording.startSec);
  function advance() {
    const next = recording.segments.find(s => s.blob && s.startSec > (segment?.startSec ?? -1) && s.startSec < recording.endSec);
    if (next) seek(Math.max(recording.startSec, next.startSec), true);
    else { video.current?.pause(); setPlaying(false); setPosition(duration); }
  }
  return <div className="session-replay">
    <div className="player"><video ref={video} src={urls.get(segmentId)} playsInline preload="auto" aria-label="Retained exercise recording" onLoadedMetadata={() => {
      if (!video.current || !segment) return;
      video.current.currentTime = Math.max(0, pending.current.time - segment.startSec);
      if (pending.current.play) void video.current.play().catch(() => setError('Press Play to start replay.'));
    }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={() => {
      if (!video.current || !segment) return;
      const absolute = segment.startSec + video.current.currentTime;
      setPosition(Math.min(duration, Math.max(0, absolute - recording.startSec)));
      if (absolute >= recording.endSec - 0.04) { video.current.pause(); setPosition(duration); }
      else if (absolute >= segment.endSec - 0.04 && !video.current.paused) advance();
    }} onEnded={advance} onError={event => {
      // Ignore errors for an old URL while a new segment is loading.
      if (event.currentTarget.currentSrc !== urls.get(segmentId)) return;
      setError('This recording segment could not be played. Try another retained clip.');
    }} /></div>
    <div className="replay-controls"><button className="secondary small-button" disabled={!urls.size} onClick={() => {
      if (playing) video.current?.pause(); else seek(position >= duration - 0.05 ? recording.startSec : recording.startSec + position, true);
    }}>{playing ? 'Pause' : 'Play'}</button><input aria-label="Replay position" type="range" min="0" max={duration} step="0.01" value={position} onChange={event => seek(recording.startSec + Number(event.target.value))} /><span>{position.toFixed(1)} / {duration.toFixed(1)}s</span></div>
    {!urls.size && <p className="muted">No playable recording was retained.</p>}{error && <p role="alert" className="error">{error}</p>}
  </div>;
}
export function SessionReplay({ recent, corrections }: { recent: RecordingWindow; corrections: SavedCorrection[] }) {
  const [selected, setSelected] = useState(-1);
  const [seek, setSeek] = useState<{ time:number; nonce:number; play?:boolean }>({ time: 0, nonce: 0 });
  const correction = corrections[selected];
  const recording = correction?.recording ?? recent;
  return <section className="post-session" aria-label="Live session review">
    <p className="eyebrow">Session complete</p><h2>Review your recent movement.</h2>
    <p className="muted">Recordings stay on this device until you start a new session, reset, or leave.</p>
    <div className="replay-tabs"><button className={selected === -1 ? 'small-button' : 'secondary small-button'} onClick={() => { setSelected(-1); setSeek({ time: 0, nonce: seek.nonce + 1 }); }}>{recent.id === 'last-reps' ? 'Last reps · up to 10 seconds' : 'Recent recording'}</button>{corrections.map((item, index) => <button key={item.criterionId} className={selected === index ? 'small-button' : 'secondary small-button'} onClick={() => { setSelected(index); setSeek({ time: Math.max(0,correctionReplayOffset(item,item.evidence[0]?.timestampSec??0)-0.75), nonce: seek.nonce + 1, play:true }); }}>{CRITERIA[item.criterionId]}</button>)}</div>
    {!correction && recent.id !== 'last-reps' && <p className="muted">Rep timing wasn’t detected, so this clip shows the end of the session.</p>}
    <ReplayPlayer key={recording.id} recording={recording} seekSec={seek} />
    {correction && <div className="review-evidence"><h3>{CRITERIA[correction.criterionId]}</h3><p>{correction.result.report.formChecks?.find(item => item.criterionId === correction.criterionId)?.note}</p><p className="muted">Session time: {recording.startSec.toFixed(1)}–{recording.endSec.toFixed(1)}s</p><div className="evidence-actions">{correction.evidence.map((item, index) => <button key={index} className="secondary small-button" onClick={() => setSeek({ time: correctionReplayOffset(correction,item.timestampSec), nonce: seek.nonce + 1 })}>Show evidence · {(correction.result.window.startSec+item.timestampSec).toFixed(2)}s</button>)}</div>{!!correction.evidenceImages?.length && <details><summary>View the exact moments assessed</summary><div className="evidence-actions">{correction.evidenceImages.map((image,index)=><button key={index} className="secondary small-button" onClick={()=>setSeek({time:correctionReplayOffset(correction,image.timestampSec),nonce:seek.nonce+1})}><img src={image.dataUrl} alt={`Assessed moment at ${(correction.result.window.startSec+image.timestampSec).toFixed(2)} seconds`} style={{width:160,maxWidth:'100%',display:'block'}} /></button>)}</div></details>}</div>}
  </section>;
}
