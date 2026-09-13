import { useEffect, useRef, useState } from 'react';
import { LIMITS, validateReportForRequest, type AnalysisReport, type AnalysisRequest, type CoachCommand } from '../shared/contracts';
import { analyzeClip } from './lib/api';
import { extractFrames, loadLocalClip, waitForMedia, type LocalClip } from './features/video/media';
import { createPlaybackController } from './features/video/playback';
import { MuscleOverlay } from './features/video/MuscleOverlay';
import { LiveExercise } from './features/live/LiveExercise';
import { ReferenceGuide, ReviewPanel } from './features/review/ReviewPanel';
import { EXERCISES, getExercise, canAnalyzeExercise } from './features/review/exercise-library';
import { EvidenceOverlay } from './features/video/EvidenceOverlay';

type Phase = 'idle' | 'loading' | 'ready' | 'extracting' | 'analyzing' | 'complete' | 'error';
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export default function App() {
  const [exercise, setExercise] = useState('');
  const [mode, setMode] = useState<'upload' | 'live'>('upload');
  const selectedExercise = getExercise(exercise);
  const reference = selectedExercise ?? EXERCISES[0];
  const referenceOnly = !!selectedExercise && !selectedExercise.analysisAvailable;
  const analysisEnabled = canAnalyzeExercise(exercise);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mappingEnabled, setMappingEnabled] = useState(false);
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
  const referenceSheetRef = useRef<HTMLDialogElement>(null);
  const openReference = () => { referenceSheetRef.current?.showModal(); };
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef<ReturnType<typeof createPlaybackController> | null>(null);
  const activeClip = useRef<LocalClip | null>(null);
  const generation = useRef(0);
  const extraction = useRef<AbortController | null>(null);
  const lastContextUpdate = useRef(0);
  const latest = useRef({ clip, report });
  latest.current = { clip, report };

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
      getDuration: () => latest.current.clip?.durationSec ?? 0,
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

  async function reset(): Promise<number | null> {
    const current = ++generation.current;
    extraction.current?.abort();
    playbackRef.current?.cancel();
    videoRef.current?.pause();
    setError(''); setPlaybackError(''); setPhase('loading');
    if (current !== generation.current) return null;
    if (activeClip.current) URL.revokeObjectURL(activeClip.current.url);
    activeClip.current = null;
    setMappingEnabled(false); setClip(null); setReady(false); setRequest(null); setSelection(null);
    setPlayback({ time: 0, paused: true, seeking: false });
    setReport(null);
    setProgress(0); setPhase('idle');
    return current;
  }

  async function changeExercise(id: string) {
    if (await reset() !== null) setExercise(id);
  }

  async function chooseFile(file: File) {
    if (!analysisEnabled) return;
    const current = await reset();
    if (current === null) return;
    const abort = new AbortController();
    extraction.current = abort;
    setPhase('loading');
    try {
      const loaded = await loadLocalClip(file, abort.signal);
      if (current !== generation.current) { URL.revokeObjectURL(loaded.url); return; }
      activeClip.current = loaded;
      setClip(loaded); setPhase('ready');
    } catch (e) {
      if (current === generation.current) { setError(messageOf(e)); setPhase('error'); }
    }
  }

  async function analyze() {
    if (!analysisEnabled || !clip || phase === 'extracting' || phase === 'analyzing') return;
    const current = ++generation.current;
    const submittedClip = clip;
    extraction.current?.abort();
    const abort = new AbortController();
    extraction.current = abort;
    setError(''); setPlaybackError(''); setPhase('extracting'); setProgress(0);
    playbackRef.current?.cancel(); videoRef.current?.pause();
    try {
      if (current !== generation.current) return;
      setReport(null); setSelection(null);
      const input = request?.clipId === submittedClip.id && request.exerciseId === exercise ? request : await extractFrames(submittedClip, reference.id, abort.signal, count => {
        if (current === generation.current) setProgress(count);
      });
      if (current !== generation.current) return;
      setRequest(input); setPhase('analyzing');
      const result = await analyzeClip(input);
      if (current !== generation.current || activeClip.current?.id !== input.clipId) return;
      const validated = validateReportForRequest(result, input);
      if (validated.source !== 'astra') throw new Error('The analysis service returned sample data. No findings have been attached to your clip.');
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
    setSelection(current => current?.id === id ? null : { id, index: 0 });
  }

  function showEvidence(id: string, index: number) {
    setPlaybackError('');
    if (!ready) { setPlaybackError('Wait for the video to finish loading.'); return; }
    playbackRef.current?.showEvidence(id, index);
    revealVideo();
  }

  const correction = report?.corrections.find(item => item.id === selection?.id);
  const evidence = correction?.evidence[selection?.index ?? 0];
  const showKeyframe = !!evidence && playback.paused && !playback.seeking && Math.abs(playback.time - evidence.timestampSec) <= 0.05;
  const working = phase === 'loading' || phase === 'extracting' || phase === 'analyzing';

  const configured = !!selectedExercise;
  const progressText = phase === 'loading' ? 'Preparing video…' : phase === 'extracting' ? `Preparing video… ${Math.round(progress / LIMITS.maxFrames * 100)}%` : phase === 'analyzing' ? 'Reviewing your form…' : '';

  return <main>
    <header><a className="brand" href="/" aria-label="MissMuscle home"><img src="/logo.png" alt="MissMuscle" width="1254" height="1254" /></a></header>
    <section className="intro"><p className="eyebrow">Your personal form coach</p><h1>Make your next rep <em>better.</em></h1></section>
    <div className="exercise-toolbar"><section className="exercise-setup" aria-label="Choose your exercise">
      <label><span className="field-label">Exercise</span><select value={exercise} disabled={working} onChange={event => void changeExercise(event.target.value)}>
        <option value="" disabled>Choose an exercise</option>{EXERCISES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
    </section><button className="secondary small-button exercise-reference" onClick={openReference} disabled={!configured}>Reference Sheet ↗</button></div>
    <div className="mode-selector" role="group" aria-label="Choose review mode">
      <button className={mode === 'upload' ? 'mode-choice selected' : 'mode-choice'} aria-pressed={mode === 'upload'} disabled={working} onClick={() => setMode('upload')}><strong>Upload a video</strong><span>Review your form with timestamped evidence</span></button>
      <button className={mode === 'live' ? 'mode-choice selected' : 'mode-choice'} aria-pressed={mode === 'live'} disabled={working} onClick={() => { videoRef.current?.pause(); setMappingEnabled(false); setMode('live'); }}><strong>Live exercise</strong><span>Move with a body map and a spoken coach</span></button>
    </div>
    {selectedExercise && <LiveExercise key={selectedExercise.id} exerciseId={selectedExercise.id} visible={mode === 'live'} />}
    {mode === 'live' && !selectedExercise && <section className="video-workspace"><h2>Choose an exercise to start live coaching.</h2></section>}
    <div hidden={mode !== 'upload'}>
    <section className="video-workspace" id="movement-video" aria-labelledby="video-title">
      <div className="video-toolbar"><div><span className="eyebrow">Your movement</span><h2 id="video-title">{referenceOnly ? reference.label : clip ? 'Let’s look at your form.' : 'Start with a short clip.'}</h2></div>
        <div className="actions">{clip && <button className="secondary small-button" disabled={working} onClick={() => fileInputRef.current?.click()}>Replace video</button>}
        </div>
      </div>
      <input ref={fileInputRef} className="visually-hidden" type="file" accept="video/*,.mp4,.mov,.webm,.m4v" disabled={!analysisEnabled || working} aria-label="Choose exercise video" onChange={event => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void chooseFile(file);
      }} />
      {clip ? <div className={mappingEnabled ? "tracking-player" : "video-only-player"} key={clip.id}><div className="source-view"><div className="viewer-heading" style={{ display: mappingEnabled ? undefined : 'none' }}><span>01 / Original video</span><span>LOCAL CLIP</span></div><div className="player"><video key={clip.id} ref={videoRef} src={clip.url} controls playsInline preload="auto" aria-label="Your local exercise clip"
        onLoadedData={() => { setReady(true); syncPlayback(true); }}
        onTimeUpdate={() => syncPlayback()} onPlay={() => syncPlayback(true)} onPause={() => syncPlayback(true)}
        onSeeking={() => syncPlayback(true)} onSeeked={() => syncPlayback(true)} onEnded={() => syncPlayback(true)}
        onError={() => { setReady(false); setPlaybackError('This video cannot be played here. Try an H.264 MP4 export.'); }} />
        <EvidenceOverlay report={report} request={request} correction={correction} evidenceIndex={selection?.index ?? 0} visible={showKeyframe} />
        {showKeyframe && correction && <div className="frame-label">Evidence · {evidence!.timestampSec.toFixed(2)}s <span>{correction.title}</span></div>}
      </div></div>{mappingEnabled && <MuscleOverlay key={reference.id} videoRef={videoRef} exerciseId={reference.id} enabled={mappingEnabled} />}</div> : <div className={`video-placeholder${referenceOnly ? ' reference-placeholder' : ''}`}>
        <div className="upload-symbol" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M20 27V9m-7 7 7-7 7 7M9 27v5h22v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
        <h3>{referenceOnly ? 'Get to know the movement.' : 'Your next rep starts here.'}</h3><p>{referenceOnly ? 'Form and muscle guides are ready. Video analysis is coming later.' : configured ? 'Upload your exercise video to get started.' : 'Choose an exercise above.'}</p>
        {!referenceOnly && <><button disabled={!analysisEnabled || working} onClick={() => fileInputRef.current?.click()}>Upload video <span aria-hidden="true">↗</span></button><small>Up to 15 seconds · max 40 MiB</small></>}
      </div>}
      {!referenceOnly && <div className="video-bottom"><div className="analysis-controls">
        <div className="analysis-action-buttons"><button className="secondary" disabled={!clip || !ready || working || !analysisEnabled} aria-pressed={mappingEnabled} onClick={() => setMappingEnabled(value => !value)}>{mappingEnabled ? 'Stop body mapping' : 'Start body mapping'}</button>
        <button disabled={!clip || !ready || working || !analysisEnabled} onClick={() => void analyze()}>{phase === 'analyzing' || phase === 'extracting' ? 'Analyzing…' : report ? 'Analyze again' : 'Analyze clip'} <span aria-hidden="true">↗</span></button></div>
        <span className="clip-meta">{clip ? `${clip.name} · ${clip.durationSec.toFixed(1)}s` : 'Your video stays on your device.'}</span>
      </div></div>}
      {progressText && <p role="status" className="progress-status">{progressText}</p>}
      {phase === 'extracting' && <progress value={progress} max={LIMITS.maxFrames} aria-label="Video preparation progress" />}
      {error && <p className="error" role="alert">{error}</p>}{playbackError && <p className="error" role="alert">{playbackError}</p>}
    </section>
    {!referenceOnly && report && <section className="corrections-section" aria-label="Video corrections">
      <ReviewPanel report={report} correction={correction} evidenceIndex={selection?.index ?? 0} showKeyframe={showKeyframe} hasVideo={!!clip} onCorrection={showCorrection} onEvidence={showEvidence} onSeek={timestampSec => handleCoachCommand({ type: 'seek_video', timestampSec })} />
    </section>}
    </div>
    <dialog ref={referenceSheetRef} className="reference-modal" aria-labelledby="reference-modal-title" onClick={event => {
      if (event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
      }
    }}>
      <div className="reference-modal-header"><div><p className="eyebrow">Reference sheet</p><h2 id="reference-modal-title">{reference.label}</h2></div><button className="secondary small-button" onClick={() => referenceSheetRef.current?.close()} aria-label="Close reference sheet" autoFocus>Close ×</button></div>
      <ReferenceGuide exercise={reference} />
    </dialog>
    <footer><span>MissMuscle ✳</span><span>Educational form guidance</span></footer>
  </main>;
}
