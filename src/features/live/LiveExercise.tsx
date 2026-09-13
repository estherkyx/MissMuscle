import { getExercise } from '../../../shared/exercises';
import { LIVE_TIMING } from '../../../shared/live-timing';
import type { LiveInspectionResult, ExerciseId } from '../../../shared/contracts';
import { useEffect, useRef, useState } from 'react';
import { MuscleOverlay } from '../video/MuscleOverlay';
import type { CoachStatus } from '../voice/coach-client';
import { appendTranscript, type TranscriptFragment } from '../review/transcript';
import { LiveExerciseSession, type SessionMetrics, type SessionReview } from './session';
import { CRITERIA, type LiveFinding } from './findings';
import { SessionReplay } from './SessionReplay';

export function LiveExercise({ visible, exerciseId }: { visible: boolean; exerciseId: ExerciseId }) {
  const exercise=getExercise(exerciseId)!;
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<LiveExerciseSession | null>(null);
  const mounted = useRef(true);
  const epoch = useRef(0);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'active' | 'ending' | 'review'>('idle');
  const [review, setReview] = useState<SessionReview | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [findings, setFindings] = useState<LiveFinding[]>([]);
  const [assessment, setAssessment] = useState<LiveInspectionResult | null>(null);
  const [status, setStatus] = useState<CoachStatus>('idle');
  const [muted, setMuted] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptFragment[]>([]);
  const [metrics, setMetrics] = useState<SessionMetrics>({ elapsedSec: 0, inspections: 0, analysisMs: null, cueAgeSec: null });
  const active = phase === 'active' || phase === 'starting';
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; void session.current?.stop(); }; }, []);
  useEffect(() => { if (!visible && session.current) void end(); }, [visible]);
  async function start() {
    if (!video.current || active || phase === 'ending') return;
    const generation = ++epoch.current;
    const current = () => mounted.current && epoch.current === generation;
    setPhase('starting'); setReview(null); setFindings([]); setAssessment(null); setErrors({}); setTranscript([]); setMuted(false);
    setMetrics({ elapsedSec: 0, inspections: 0, analysisMs: null, cueAgeSec: null });
    const runtime = new LiveExerciseSession(video.current, {
      onReady: () => { if (current()) setPhase('active'); },
      onError: (channel, message) => {
        if (!current()) return;
        setErrors(previous => ({ ...previous, [channel]: message }));
        if (channel === 'camera' && message) void end();
      },
      onFindings: value => { if (current()) setFindings(value); },
      onAssessment: value => { if (current()) setAssessment(value); },
      onStatus: value => { if (current()) setStatus(value); },
      onTranscript: entry => { if (current()) setTranscript(previous => appendTranscript(previous, entry).slice(-100)); },
      onMetrics: value => { if (current()) setMetrics(value); },
      onAnalyzing: value => { if (current()) setAnalyzing(value); },
    },exerciseId);
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
  function reset() { epoch.current++; setReview(null); setFindings([]); setAssessment(null); setTranscript([]); setErrors({}); setPhase('idle'); }
  return <section className="video-workspace live-workspace" hidden={!visible} aria-label="Live exercise coach">
    <div className="video-toolbar"><div><p className="eyebrow">Live exercise · {exercise.label}</p><h2>Your coach, alongside every rep.</h2></div><div className="actions">
      {active ? <><button className="secondary small-button" aria-pressed={muted} onClick={() => { session.current?.setMuted(!muted); setMuted(!muted); }}>{muted ? 'Unmute coach' : 'Mute coach'}</button><button className="small-button" onClick={() => void end()}>End session</button></> : <button className="small-button" disabled={phase === 'ending'} onClick={() => void start()}>{phase === 'ending' ? 'Ending session…' : review ? 'Start new session' : 'Start session'}</button>}
      {review && phase !== 'ending' && <button className="secondary small-button" onClick={reset}>Reset</button>}
    </div></div>
    {!active && phase !== 'ending' && !review && <div className="live-introduction"><h3>Display yourself working out.</h3><p>{exercise.camera} Your coach reviews your reps and automatically gives you feedback to improve your form. Recent video and up to five correction clips can be replayed for you to revisit your movement</p></div>}
    <div hidden={!active}>
      <div className="live-status" role="status"><span className="live-dot" />{phase === 'starting' ? 'Starting camera and coach…' : analyzing ? 'Reviewing your recent reps…' : 'Watching for your next reps'}<span>Coach: {muted ? 'muted' : status}</span></div>
      <div className="tracking-player"><div className="source-view"><div className="viewer-heading"><span>01 / Your camera</span><span>LIVE</span></div><div className="player"><video ref={video} autoPlay muted playsInline aria-label="Live exercise camera" /></div></div><MuscleOverlay videoRef={video} exerciseId={exerciseId} enabled={phase === 'active' && visible} live onPose={(poses, width, height, time) => session.current?.observePose(poses, width, height, time)} /></div>
      <div className="live-findings"><div className="section-heading"><h2>Coaching notes</h2><span className="muted">Based on your recent reps</span></div>
        {assessment && <p className="muted">Latest review: {assessment.report.summary}</p>}
        {!assessment && <p className="muted">{errors.analysis ? 'No movement assessment has completed yet.' : 'Waiting for your first movement assessment…'}</p>}
        {findings.map(finding => <article key={finding.criterionId} className={`live-finding ${finding.status}`}><span className="eyebrow">{CRITERIA[finding.criterionId]} · {finding.status === 'needs_attention' ? 'Try this next rep' : finding.status === 'improved' ? 'Reviewed rep looked more consistent' : 'Looked consistent in the reviewed rep'}</span><p>{finding.note}</p><small>Observed {Math.max(0, metrics.elapsedSec - finding.observedThroughSec).toFixed(1)}s ago</small>{metrics.elapsedSec - finding.observedThroughSec > LIVE_TIMING.maxEvidenceAgeSec && <small>Earlier observation · awaiting a fresh assessment</small>}</article>)}
      </div>
    </div>
    {Object.entries(errors).filter(([, message]) => message).map(([channel, message]) => <p key={channel} role="alert" className="error">{message}</p>)}
    {review && <SessionReplay recent={review.recent} corrections={review.corrections} />}
    {!!transcript.length && <details className="conversation"><summary>Spoken corrections</summary><div className="transcript" role="log">{transcript.map((entry, index) => <p key={index}><strong>{entry.role === 'user' ? 'You' : 'Coach'}:</strong> {entry.text}</p>)}</div></details>}
  </section>;
}
