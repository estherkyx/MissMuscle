import { useEffect, useMemo, useRef, useState } from 'react';
import { CoachContextSchema, LIMITS, validateReportForRequest, type AnalysisReport, type AnalysisRequest, type CoachCommand } from '../shared/contracts';
import { demoReport } from '../shared/fixtures/demo-report';
import { analyzeClip } from './lib/api';
import { extractFrames, loadLocalClip, waitForMedia, type LocalClip } from './features/video/media';
import { createPlaybackController } from './features/video/playback';
import { CoachPanel, type CoachPanelHandle } from './features/review/CoachPanel';
import { MuscleGuide, ReferenceGuide, ReviewPanel } from './features/review/ReviewPanel';
import { EXERCISES, getExercise, canAnalyzeExercise } from './features/review/exercise-library';
import { EvidenceOverlay } from './features/video/EvidenceOverlay';

type Mode = 'analysis' | 'sample';
type Phase = 'idle' | 'loading' | 'ready' | 'extracting' | 'analyzing' | 'complete' | 'error';
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export default function App() {
  const [exercise, setExercise] = useState('');
  const selectedExercise = getExercise(exercise);
  const reference = selectedExercise ?? EXERCISES[0];
  const referenceOnly = !!selectedExercise && !selectedExercise.analysisAvailable;
  const analysisEnabled = canAnalyzeExercise(exercise);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('analysis');
  const [clip, setClip] = useState<LocalClip | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [request, setRequest] = useState<AnalysisRequest | null>(null);
  const [selection, setSelection] = useState<{ id: string; index: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [playbackError, setPlaybackError] = useState('');
  const [ready, setReady] = useState(false);
  const [playback, setPlayback] = useState({ time: 0, paused: true, seeking: false });
  const videoRef = useRef<HTMLVideoElement>(null);
  const coachRef = useRef<CoachPanelHandle>(null);
  const playbackRef = useRef<ReturnType<typeof createPlaybackController> | null>(null);
  const activeClip = useRef<LocalClip | null>(null);
  const generation = useRef(0);
  const extraction = useRef<AbortController | null>(null);
  const lastContextUpdate = useRef(0);
  const latest = useRef({ clip, report, mode });
  latest.current = { clip, report, mode };

  function syncPlayback(force = false) {
    const video = videoRef.current;
    if (!video) return;
    const now = performance.now();
    if (!force && now - lastContextUpdate.current < 250) return;
    lastContextUpdate.current = now;
    setPlayback({ time: video.currentTime, paused: video.paused, seeking: video.seeking });
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip) return;
    const controller = createPlaybackController({
      video,
      getDuration: () => latest.current.mode === 'sample' ? demoReport.durationSec : latest.current.clip?.durationSec ?? 0,
      getReport: () => latest.current.report,
      onSelect: (id, index) => setSelection({ id, index }),
      onSettled: () => syncPlayback(true),
      onError: setPlaybackError,
    });
    playbackRef.current = controller;
    return () => { controller.dispose(); if (playbackRef.current === controller) playbackRef.current = null; };
  }, [clip?.id, report?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip || video.readyState >= 2) return;
    const abort = new AbortController();
    void waitForMedia(video, 'loadeddata', abort.signal).catch(e => {
      if (!abort.signal.aborted) { setReady(false); setPlaybackError(messageOf(e)); }
    });
    return () => abort.abort();
  }, [clip?.id]);

  useEffect(() => () => {
    generation.current++;
    extraction.current?.abort();
    if (activeClip.current) URL.revokeObjectURL(activeClip.current.url);
    activeClip.current = null;
  }, []);

  async function reset(nextMode: Mode): Promise<number | null> {
    const current = ++generation.current;
    extraction.current?.abort();
    playbackRef.current?.cancel();
    videoRef.current?.pause();
    setError(''); setPlaybackError(''); setPhase('loading');
    try { await coachRef.current?.stop(); }
    catch (e) { if (current === generation.current) { setError(messageOf(e)); setPhase('error'); } return null; }
    if (current !== generation.current) return null;
    if (activeClip.current) URL.revokeObjectURL(activeClip.current.url);
    activeClip.current = null;
    setClip(null); setReady(false); setRequest(null); setSelection(null);
    setPlayback({ time: 0, paused: true, seeking: false });
    if (nextMode === 'sample') setExercise('dumbbell_curl');
    setMode(nextMode); setReport(nextMode === 'sample' ? demoReport : null);
    setProgress(0); setPhase('idle');
    return current;
  }

  async function changeExercise(id: string) {
    if (await reset('analysis') !== null) setExercise(id);
  }

  async function chooseFile(file: File, nextMode: Mode) {
    if (!analysisEnabled) return;
    const current = await reset(nextMode);
    if (current === null) return;
    const abort = new AbortController();
    extraction.current = abort;
    setPhase('loading');
    try {
      const loaded = await loadLocalClip(file, abort.signal);
      if (current !== generation.current) { URL.revokeObjectURL(loaded.url); return; }
      if (nextMode === 'sample' && loaded.durationSec < demoReport.durationSec) {
        URL.revokeObjectURL(loaded.url);
        throw new Error('The sample needs a 12–15-second local clip. Its fictional playback timeline covers the first 12 seconds.');
      }
      activeClip.current = loaded;
      setClip(loaded); setPhase('ready');
    } catch (e) {
      if (current === generation.current) { setError(messageOf(e)); setPhase('error'); }
    }
  }

  async function analyze() {
    if (!analysisEnabled || !clip || mode !== 'analysis' || phase === 'extracting' || phase === 'analyzing') return;
    const current = ++generation.current;
    const submittedClip = clip;
    extraction.current?.abort();
    const abort = new AbortController();
    extraction.current = abort;
    setError(''); setPlaybackError(''); setPhase('extracting'); setProgress(0);
    playbackRef.current?.cancel(); videoRef.current?.pause();
    try {
      await coachRef.current?.stop();
      if (current !== generation.current) return;
      setReport(null); setSelection(null);
      const input = request?.clipId === submittedClip.id ? request : await extractFrames(submittedClip, abort.signal, count => {
        if (current === generation.current) setProgress(count);
      });
      if (current !== generation.current) return;
      setRequest(input); setPhase('analyzing');
      const result = await analyzeClip(input);
      if (current !== generation.current || activeClip.current?.id !== input.clipId) return;
      const validated = validateReportForRequest(result, input);
      if (validated.source !== 'astra') throw new Error('The analysis service returned sample data. No findings have been attached to your clip.');
      await coachRef.current?.stop();
      if (current !== generation.current) return;
      videoRef.current?.pause();
      setReport(validated); setPhase('complete');
    } catch (e) {
      if (current === generation.current) { setError(messageOf(e)); setPhase('error'); }
    }
  }

  function handleCoachCommand(command: CoachCommand) {
    setPlaybackError('');
    if (!ready || !playbackRef.current) { setPlaybackError('Load a playable clip before using playback commands.'); return; }
    playbackRef.current.handleCoachCommand(command);
    if (command.type !== 'pause_video') revealVideo();
  }

  function revealVideo() {
    document.getElementById('movement-video')?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  function showCorrection(id: string) {
    if (!clip && mode === 'sample') { setSelection({ id, index: 0 }); return; }
    handleCoachCommand({ type: 'show_correction', correctionId: id });
  }

  function showEvidence(id: string, index: number) {
    if (!clip && mode === 'sample') { setSelection({ id, index }); return; }
    setPlaybackError('');
    if (!ready) { setPlaybackError('Wait for the video to finish loading.'); return; }
    playbackRef.current?.showEvidence(id, index);
    revealVideo();
  }

  const correction = report?.corrections.find(item => item.id === selection?.id);
  const evidence = correction?.evidence[selection?.index ?? 0];
  const showKeyframe = !!evidence && playback.paused && !playback.seeking && Math.abs(playback.time - evidence.timestampSec) <= 0.05;
  const context = useMemo(() => {
    if (!analysisEnabled || !report || !clip || !ready) return null;
    const result = CoachContextSchema.safeParse({ report, currentTimeSec: Math.min(report.durationSec, Math.max(0, playback.time)), selectedCorrectionId: correction?.id ?? null });
    return result.success ? result.data : null;
  }, [analysisEnabled, report, clip, ready, playback.time, playback.paused, playback.seeking, correction?.id]);
  const working = phase === 'loading' || phase === 'extracting' || phase === 'analyzing';

  const configured = !!selectedExercise;
  const progressText = phase === 'loading' ? 'Preparing video…' : phase === 'extracting' ? `Preparing frames · ${progress}/${LIMITS.maxFrames}` : phase === 'analyzing' ? 'Reviewing your form…' : '';

  return <main>
    <header><a className="brand" href="/">MissMuscle<span>✳</span></a><span className="tag">A little guidance. A stronger next rep.</span><a className="reference-link" href="#reference-sheet">Reference sheet ↗</a></header>
    <section className="intro"><p className="eyebrow">Your personal form coach</p><h1>Make your next rep <em>better.</em></h1></section>
    <section className="exercise-setup" aria-label="Choose your exercise">
      <label><span className="field-label">Exercise</span><select value={exercise} disabled={working} onChange={event => void changeExercise(event.target.value)}>
        <option value="" disabled>Choose an exercise</option>{EXERCISES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
    </section>
    <section className="video-workspace" id="movement-video" aria-labelledby="video-title">
      <div className="video-toolbar"><div><span className="eyebrow">Your movement</span><h2 id="video-title">{referenceOnly ? reference.label : clip ? 'Let’s look at your form.' : 'Start with a short clip.'}</h2></div>
        <div className="actions">{clip && <button className="secondary small-button" disabled={working} onClick={() => fileInputRef.current?.click()}>Replace video</button>}
        <button className="text-button" aria-pressed={mode === 'sample'} disabled={working} onClick={() => void reset(mode === 'sample' ? 'analysis' : 'sample')}>{mode === 'sample' ? 'Exit sample' : 'Try a curl sample ↗'}</button></div>
      </div>
      {mode === 'sample' && <p className="sample-banner">Fictional sample findings — not an assessment of your clip. Add a 12–15s video to try playback.</p>}
      <input ref={fileInputRef} className="visually-hidden" type="file" accept="video/*,.mp4,.mov,.webm,.m4v" disabled={!analysisEnabled || working} aria-label="Choose exercise video" onChange={event => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void chooseFile(file, mode);
      }} />
      {clip ? <div className="player"><video key={clip.id} ref={videoRef} src={clip.url} controls playsInline preload="auto" aria-label="Your local exercise clip"
        onLoadedData={() => { setReady(true); syncPlayback(true); }}
        onTimeUpdate={() => syncPlayback()} onPlay={() => syncPlayback(true)} onPause={() => syncPlayback(true)}
        onSeeking={() => syncPlayback(true)} onSeeked={() => syncPlayback(true)} onEnded={() => syncPlayback(true)}
        onError={() => { setReady(false); setPlaybackError('This video cannot be played here. Try an H.264 MP4 export.'); }} />
        <EvidenceOverlay report={report} request={request} correction={correction} evidenceIndex={selection?.index ?? 0} visible={showKeyframe} />
        {showKeyframe && correction && <div className="frame-label">{mode === 'sample' ? 'Sample moment' : 'Evidence'} · {evidence!.timestampSec.toFixed(2)}s <span>{correction.title}</span></div>}
      </div> : <div className={`video-placeholder${referenceOnly ? ' reference-placeholder' : ''}`}>
        <div className="upload-symbol" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M20 27V9m-7 7 7-7 7 7M9 27v5h22v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
        <h3>{referenceOnly ? 'Get to know the movement.' : 'Your next rep starts here.'}</h3><p>{referenceOnly ? 'Form and muscle guides are ready. Video analysis is coming later.' : configured ? 'Keep your working arm and torso in view.' : 'Choose an exercise above.'}</p>
        {referenceOnly ? <a className="reference-cta" href="#reference-sheet">View reference sheet ↓</a> : <><button disabled={!analysisEnabled || working} onClick={() => fileInputRef.current?.click()}>Upload video <span aria-hidden="true">↗</span></button><small>{mode === 'sample' ? '12–15 seconds' : 'Up to 15 seconds'} · max 40 MiB</small></>}
      </div>}
      {!referenceOnly && <div className="video-bottom"><div className="analysis-controls">
        {mode === 'analysis' && <button disabled={!clip || !ready || working || !analysisEnabled} onClick={() => void analyze()}>{phase === 'analyzing' || phase === 'extracting' ? 'Analyzing…' : report ? 'Analyze again' : 'Analyze clip'} <span aria-hidden="true">↗</span></button>}
        <span className="clip-meta">{clip ? `${clip.name} · ${clip.durationSec.toFixed(1)}s` : 'Your video stays on your device.'}</span>
      </div><CoachPanel key={`${mode}:${clip?.id ?? 'none'}:${report?.id ?? 'none'}`} ref={coachRef} context={context} onCommand={handleCoachCommand} /></div>}
      {progressText && <p role="status" className="progress-status">{progressText}</p>}
      {phase === 'extracting' && <progress value={progress} max={LIMITS.maxFrames} aria-label="Frame extraction progress" />}
      {error && <p className="error" role="alert">{error}</p>}{playbackError && <p className="error" role="alert">{playbackError}</p>}
      {!referenceOnly && <details className="recording-tips"><summary>Recording tips & privacy</summary><p>{reference.camera}</p><p>Only selected images are sent for analysis when you choose Analyze clip. Your original video stays in this browser.</p></details>}
    </section>
    {!referenceOnly && <section className="corrections-section" aria-label="Video corrections">
      {report ? <ReviewPanel report={report} correction={correction} evidenceIndex={selection?.index ?? 0} showKeyframe={showKeyframe} hasVideo={!!clip} onCorrection={showCorrection} onEvidence={showEvidence} /> : <div className="corrections-empty"><div><p className="eyebrow">Your next rep</p><h2>Small adjustments. Better movement.</h2></div><p>Your corrections will appear here.<br />Tap one to jump to that moment.</p></div>}
    </section>}
    <section id="reference-sheet" className="reference-sheet" aria-labelledby="reference-sheet-title"><div className="reference-heading"><div><p className="eyebrow">Keep this handy</p><h2 id="reference-sheet-title">Your reference sheet</h2></div><span className="reference-pill">{reference.shortLabel} / {reference.muscles.map(item => item.label).join(' & ')}</span></div><div className="reference-grid"><ReferenceGuide exercise={reference} /><MuscleGuide exercise={reference} /></div></section>
    <footer><span>MissMuscle ✳</span><span>Educational form guidance</span></footer>
  </main>;
}
