import { useEffect, useRef, useState } from 'react';
import { MuscleOverlay } from '../video/MuscleOverlay';
import type { CoachStatus } from '../voice/coach-client';
import { appendTranscript, type TranscriptFragment } from '../review/transcript';
import { LiveExerciseSession, type SessionMetrics, type SessionReview } from './session';
import { CRITERIA, type LiveFinding } from './findings';
import { SessionReplay } from './SessionReplay';

export function LiveExercise({ visible }: { visible: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<LiveExerciseSession | null>(null);
  const mounted = useRef(true);
  const epoch = useRef(0);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'active' | 'ending' | 'review'>('idle');
  const [review, setReview] = useState<SessionReview | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [findings, setFindings] = useState<LiveFinding[]>([]);
  const [status, setStatus] = useState<CoachStatus>('idle');
  const [muted, setMuted] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptFragment[]>([]);
  const [fps, setFps] = useState(0);
  const [metrics, setMetrics] = useState<SessionMetrics>({ elapsedSec: 0, inspections: 0, analysisMs: null, cueAgeSec: null });
  const active = phase === 'active' || phase === 'starting';
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; void session.current?.stop(); }; }, []);
  useEffect(() => { if (!visible && session.current) void end(); }, [visible]);
  async function start() {
    if (!video.current || active || phase === 'ending') return;
    const generation = ++epoch.current;
    const current = () => mounted.current && epoch.current === generation;
    setPhase('starting'); setReview(null); setFindings([]); setErrors({}); setTranscript([]); setMuted(false); setFps(0);
    setMetrics({ elapsedSec: 0, inspections: 0, analysisMs: null, cueAgeSec: null });
    const runtime = new LiveExerciseSession(video.current, {
      onReady: () => { if (current()) setPhase('active'); },
      onError: (channel, message) => {
        if (!current()) return;
        setErrors(previous => ({ ...previous, [channel]: message }));
        if (channel === 'camera' && message) void end();
      },
      onFindings: value => { if (current()) setFindings(value); },
      onStatus: value => { if (current()) setStatus(value); },
      onTranscript: entry => { if (current()) setTranscript(previous => appendTranscript(previous, entry).slice(-100)); },
      onMetrics: value => { if (current()) setMetrics(value); },
      onAnalyzing: value => { if (current()) setAnalyzing(value); },
    });
    session.current = runtime;
    try { await runtime.start(); }
    catch (error) {
      if (current()) { setErrors(previous => ({ ...previous, camera: error instanceof Error ? error.message : 'Camera could not start.' })); setPhase('idle'); session.current = null; }
    }
  }
  async function end() {
    const runtime = session.current;
    if (!runtime) return;
    setPhase('ending'); setAnalyzing(false);
    const result = await runtime.stop();
    if (!mounted.current || session.current !== runtime) return;
    session.current = null; setReview(result); setPhase('review'); setStatus('idle');
  }
  function reset() { epoch.current++; setReview(null); setFindings([]); setTranscript([]); setErrors({}); setPhase('idle'); }
  return <section className="video-workspace live-workspace" hidden={!visible} aria-label="Live exercise coach">
    <div className="video-toolbar"><div><p className="eyebrow">Live exercise · dumbbell curl</p><h2>Your coach, alongside every rep.</h2></div><div className="actions">
      {active ? <><button className="secondary small-button" aria-pressed={muted} onClick={() => { session.current?.setMuted(!muted); setMuted(!muted); }}>{muted ? 'Unmute coach' : 'Mute coach'}</button><button className="small-button" onClick={() => void end()}>End session</button></> : <button className="small-button" disabled={phase === 'ending'} onClick={() => void start()}>{phase === 'ending' ? 'Ending session…' : review ? 'Start new session' : 'Start session'}</button>}
      {review && phase !== 'ending' && <button className="secondary small-button" onClick={reset}>Reset</button>}
    </div></div>
    {!active && phase !== 'ending' && !review && <div className="live-introduction"><h3>Display yourself working out.</h3><p>Position your laptop so your shoulders, elbows and wrists stay visible. Your coach reviews your reps and automatically gives you feedback to improve your form. Recent video and up to five correction clips can be replayed for you to revisit your movement</p></div>}
    <div hidden={!active}>
      <div className="live-status" role="status"><span className="live-dot" />{phase === 'starting' ? 'Starting camera and coach…' : analyzing ? 'Reviewing your recent reps…' : 'Watching for your next reps'}<span>Coach: {muted ? 'muted' : status}</span></div>
      <div className="tracking-player"><div className="source-view"><div className="viewer-heading"><span>01 / Your camera</span><span>LIVE</span></div><div className="player"><video ref={video} autoPlay muted playsInline aria-label="Live exercise camera" /></div></div><MuscleOverlay videoRef={video} enabled={phase === 'active' && visible} live onTrackingRate={setFps} /></div>
      <div className="live-findings"><div className="section-heading"><h2>Coaching notes</h2><span className="muted">Based on your recent reps</span></div>
        {!findings.length && <p className="muted">{metrics.inspections ? 'No supported corrections so far. Keep the relevant body areas visible.' : 'Corrections will appear as your movement is analysed.'}</p>}
        {findings.map(finding => <article key={finding.criterionId} className={`live-finding ${finding.status}`}><span className="eyebrow">{CRITERIA[finding.criterionId]} · {finding.status === 'improved' ? 'Looks more consistent' : 'Try this'}</span><p>{finding.note}</p>{metrics.elapsedSec - finding.observedThroughSec > 15 && <small>Earlier observation · awaiting a fresh assessment</small>}</article>)}
      </div>
    </div>
    {Object.entries(errors).filter(([, message]) => message).map(([channel, message]) => <p key={channel} role="alert" className="error">{message}</p>)}
    {review && <SessionReplay recent={review.recent} corrections={review.corrections} />}
    {!!transcript.length && <details className="conversation"><summary>Spoken corrections</summary><div className="transcript" role="log">{transcript.map((entry, index) => <p key={index}><strong>{entry.role === 'user' ? 'You' : 'Coach'}:</strong> {entry.text}</p>)}</div></details>}
    {(active || review) && <details className="session-diagnostics"><summary>Session performance</summary><p>{fps.toFixed(1)} tracking updates/s · {metrics.inspections} completed visual inspections · {Math.round(metrics.elapsedSec)} seconds</p><p>Last visual analysis: {metrics.analysisMs === null ? 'not measured' : `${(metrics.analysisMs / 1000).toFixed(1)}s`}. Last spoken cue evidence age: {metrics.cueAgeSec === null ? 'not measured' : `${metrics.cueAgeSec.toFixed(1)}s`}.</p><p>These timings measure analysis and evidence age, not the complete audio playback delay. Provider cost has not been verified for this session.</p></details>}
  </section>;
}
