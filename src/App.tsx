import { useEffect, useMemo, useRef, useState } from 'react';
import { CoachContextSchema, LIMITS, validateReportForRequest, type AnalysisReport, type AnalysisRequest, type CoachCommand } from '../shared/contracts';
import { demoReport } from '../shared/fixtures/demo-report';
import { analyzeClip } from './lib/api';
import { extractFrames, loadLocalClip, waitForMedia, type LocalClip } from './features/video/media';
import { createPlaybackController } from './features/video/playback';
import { MuscleOverlay } from './features/video/MuscleOverlay';
import { CoachPanel, type CoachPanelHandle } from './features/review/CoachPanel';
import { MuscleGuide, ReferenceGuide, ReviewPanel } from './features/review/ReviewPanel';
import { curlReference } from './features/review/curl-reference';

type Mode = 'analysis' | 'sample';
type Phase = 'idle' | 'loading' | 'ready' | 'extracting' | 'analyzing' | 'complete' | 'error';
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export default function App() {
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
    setMode(nextMode); setReport(nextMode === 'sample' ? demoReport : null);
    setProgress(0); setPhase('idle');
    return current;
  }

  async function chooseFile(file: File, nextMode: Mode) {
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
    if (!clip || mode !== 'analysis' || phase === 'extracting' || phase === 'analyzing') return;
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
  }

  const correction = report?.corrections.find(item => item.id === selection?.id);
  const evidence = correction?.evidence[selection?.index ?? 0];
  const showKeyframe = !!evidence && playback.paused && !playback.seeking && Math.abs(playback.time - evidence.timestampSec) <= 0.05;
  const context = useMemo(() => {
    if (!report || !clip || !ready) return null;
    const result = CoachContextSchema.safeParse({ report, currentTimeSec: Math.min(report.durationSec, Math.max(0, playback.time)), selectedCorrectionId: correction?.id ?? null });
    return result.success ? result.data : null;
  }, [report, clip, ready, playback.time, playback.paused, playback.seeking, correction?.id]);
  const working = phase === 'loading' || phase === 'extracting' || phase === 'analyzing';

  return <main>
    <header><a className="brand" href="/">MissMuscle<span>✳</span></a><span className="tag">Your movement, understood.</span></header>
    <section className="intro"><p className="eyebrow">A little guidance. A stronger next rep.</p><h1>See your form.<br /><em>Find your focus.</em></h1><p>Review a standing dumbbell curl, explore the evidence, and talk through your next rep.</p></section>
    <div className="mode-switch" aria-label="Review mode">
      <button className={mode === 'analysis' ? '' : 'secondary'} aria-pressed={mode === 'analysis'} onClick={() => { if (mode !== 'analysis') void reset('analysis'); }}>Review my clip</button>
      <button className={mode === 'sample' ? '' : 'secondary'} aria-pressed={mode === 'sample'} onClick={() => { if (mode !== 'sample') void reset('sample'); }}>Explore a sample report</button>
    </div>
    {mode === 'sample' && <p className="sample-banner">Fictional sample findings — not an assessment of this clip. A local video can demonstrate the first 12 seconds of playback; it is not sent for analysis.</p>}
    <div className="workspace">
      <section className="panel">
        <p className="eyebrow">01 / Your movement</p><h2>Standing dumbbell curl</h2>
        <p className="muted">Palms-up curl · one clip · up to 15 seconds / 40 MiB</p>
        <label className="file-picker">{mode === 'sample' ? 'Choose a local sample clip (12–15 seconds)' : 'Choose your curl clip'}
          <input key={mode} type="file" accept="video/*,.mp4,.mov,.webm,.m4v" onChange={event => {
            const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void chooseFile(file, mode);
          }} />
        </label>
        {clip ? <>
          <div className="tracking-player" key={clip.id}><div className="source-view"><div className="viewer-heading"><span>01 / Original video</span><span>LOCAL CLIP</span></div><div className="player"><video key={clip.id} ref={videoRef} src={clip.url} controls playsInline preload="auto" aria-label="Your local curl clip"
            onLoadedData={() => { setReady(true); syncPlayback(true); }}
            onTimeUpdate={() => syncPlayback()} onPlay={() => syncPlayback(true)} onPause={() => syncPlayback(true)}
            onSeeking={() => syncPlayback(true)} onSeeked={() => syncPlayback(true)} onEnded={() => syncPlayback(true)}
            onError={() => { setReady(false); setPlaybackError('This video cannot be played here. Try an H.264 MP4 export.'); }} /></div></div>
            <MuscleOverlay videoRef={videoRef} />
          </div>
          <p className="clip-meta">{clip.name} · {clip.durationSec.toFixed(2)}s · {clip.width} × {clip.height}{mode === 'sample' && ' · sample playback ends at 12s'}</p>
        </> : <div className="video-placeholder"><span aria-hidden="true">↗</span><p>Your movement starts here</p><small>Choose a short clip with a clear view of your working arm and torso.</small></div>}
        <p className="muted">{curlReference.camera}</p>
        {mode === 'analysis' && <>
          <p className="privacy-note">Your original video stays in this browser. Only selected images are sent when you choose Analyze clip.</p>
          <button onClick={() => void analyze()} disabled={!clip || !ready || working}>{phase === 'error' && clip ? 'Retry analysis' : 'Analyze clip'}</button>
        </>}
        <p role="status" className="muted">{phase === 'loading' ? 'Preparing your clip…' : phase === 'extracting' ? `Extracting frames · ${progress}/${LIMITS.maxFrames}` : phase === 'analyzing' ? 'Analyzing selected frames…' : phase === 'complete' ? 'Your report is ready.' : ''}</p>
        {phase === 'extracting' && <progress value={progress} max={LIMITS.maxFrames} aria-label="Frame extraction progress" />}
        {error && <p className="error" role="alert">{error}</p>}
        {playbackError && <p className="error" role="alert">{playbackError}</p>}
        {import.meta.env.DEV && <details className="simulator"><summary>Development playback simulator · not GPT-Live</summary>
          <p className="muted">Send app commands without voice. Sample commands do not validate the fictional findings.</p>
          <div className="actions">{report?.corrections.map(item => <button key={item.id} className="secondary" disabled={!ready} onClick={() => handleCoachCommand({ type: 'show_correction', correctionId: item.id })}>Show: {item.title}</button>)}
            <button className="secondary" disabled={!ready} onClick={() => handleCoachCommand({ type: 'seek_video', timestampSec: 0 })}>Seek to start</button>
            <button className="secondary" disabled={!ready} onClick={() => handleCoachCommand({ type: 'pause_video' })}>Pause</button>
            <button className="secondary" disabled={!ready} onClick={() => handleCoachCommand({ type: 'replay_segment', startSec: 0, endSec: Math.min(3, report?.durationSec ?? clip?.durationSec ?? 0) })}>Replay first 3s (or full shorter clip)</button>
          </div>
        </details>}
        <ReferenceGuide />
      </section>
      <div className="panel review-column">
        {report ? <ReviewPanel report={report} correction={correction} evidenceIndex={selection?.index ?? 0} request={request} showKeyframe={showKeyframe} hasVideo={!!clip} onCorrection={showCorrection} onEvidence={showEvidence} /> : <section><p className="eyebrow">02 / Your next rep</p><h2>Make one thing clearer.</h2><p className="muted">Analyze your clip to compare visible movement with the basic curl guidance. You can also explore a clearly labelled sample report.</p><p className="muted">Only sampled moments can be reviewed. A hidden wrist or unclear movement should remain unassessed.</p></section>}
        <CoachPanel key={`${mode}:${clip?.id ?? 'none'}:${report?.id ?? 'none'}`} ref={coachRef} context={context} onCommand={handleCoachCommand} />
        <MuscleGuide />
      </div>
    </div>
    <footer>MissMuscle · Visual Understanding + GPT-Live-1 · Educational form guidance</footer>
  </main>;
}
