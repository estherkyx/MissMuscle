import { validateReportForRequest, type LiveCoachContext, type LiveInspectionResult } from '../../../shared/contracts';
import { inspectLiveWindow } from '../../lib/api';
import { connectLiveCoach, type LiveCoachConnection, type CoachStatus } from '../voice/coach-client';
import { CameraFrames, RollingRecording, type RecordingWindow } from './recording';
import { createCuePolicy, createInspectionQueue, mergeFindings, retainCorrections, type LiveFinding, type SavedCorrection } from './findings';

export interface SessionMetrics { elapsedSec: number; inspections: number; analysisMs: number | null; cueAgeSec: number | null }
export interface SessionReview { recent: RecordingWindow; corrections: SavedCorrection[] }
export interface SessionCallbacks {
  onReady(): void;
  onError(channel: 'camera' | 'analysis' | 'voice' | 'recording', message: string): void;
  onFindings(findings: LiveFinding[]): void;
  onStatus(status: CoachStatus): void;
  onTranscript(entry: { role: 'user' | 'coach'; text: string; final: boolean }): void;
  onMetrics(metrics: SessionMetrics): void;
  onAnalyzing(analyzing: boolean): void;
}
export class LiveExerciseSession {
  private id = crypto.randomUUID();
  private origin = performance.now();
  private abort = new AbortController();
  private stream?: MediaStream;
  private recording?: RollingRecording;
  private frames = new CameraFrames();
  private voice?: LiveCoachConnection;
  private voicePending?: Promise<void>;
  private stopPending?: Promise<SessionReview>;
  private timers: Array<ReturnType<typeof setInterval>> = [];
  private latest: LiveInspectionResult | null = null;
  private findings: LiveFinding[] = [];
  private saved: SavedCorrection[] = [];
  private cuePolicy = createCuePolicy();
  private muted = false;
  private nextPeriodic = Infinity;
  private metrics: SessionMetrics = { elapsedSec: 0, inspections: 0, analysisMs: null, cueAgeSec: null };
  private queue = createInspectionQueue((question?: string) => this.analyze(question));
  constructor(private video: HTMLVideoElement, private callbacks: SessionCallbacks) {}
  private clock = () => (performance.now() - this.origin) / 1000;
  private context(): LiveCoachContext { return { mode: 'live', guidanceOnly: true, sessionId: this.id, exerciseId: 'dumbbell_curl', elapsedSec: this.clock(), latest: this.latest }; }
  private active = () => !this.abort.signal.aborted;

  async start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Live exercise requires Chrome on HTTPS or localhost with camera recording support.');
    this.voicePending = connectLiveCoach({
      context: this.context(), signal: this.abort.signal,
      onStatus: status => { if (this.active()) this.callbacks.onStatus(status); },
      onError: message => { if (this.active()) this.callbacks.onError('voice', message); },
      onTranscript: entry => { if (this.active()) this.callbacks.onTranscript(entry); },
    }).then(async voice => {
      if (!this.active()) { await voice.disconnect(); return; }
      this.voice = voice; voice.setMuted(this.muted); voice.updateContext(this.context());
    }).catch(error => { if (this.active()) this.callbacks.onError('voice', error instanceof Error ? error.message : 'Voice unavailable.'); });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
      if (!this.active()) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      for (const track of stream.getVideoTracks()) track.onended = () => { if (this.active()) { this.callbacks.onError('camera', 'Camera disconnected. End this session and start again.'); void this.stop(); } };
      this.video.srcObject = stream;
      await this.video.play();
      if (!this.active()) return;
      this.recording = new RollingRecording(stream, this.clock, message => { if (this.active()) this.callbacks.onError('recording', message); });
      this.recording.start();
      const capture = () => { if (this.active()) try { this.frames.capture(this.video, this.clock()); } catch { this.callbacks.onError('analysis', 'Camera frames could not be prepared for analysis.'); } };
      capture(); this.timers.push(setInterval(capture, 850));
      this.nextPeriodic = this.clock() + 5;
      this.timers.push(setInterval(() => this.tick(), 1000));
      this.callbacks.onReady();
    } catch (error) {
      if (this.active()) this.callbacks.onError('camera', error instanceof DOMException && error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access and start again.' : error instanceof Error ? error.message : 'Camera unavailable.');
      await this.stop();
      throw error;
    }
  }
  private tick() {
    if (!this.active()) return;
    const now = this.clock();
    this.metrics.elapsedSec = now;
    this.callbacks.onMetrics({ ...this.metrics });
    this.voice?.updateContext(this.context());
    if (now >= this.nextPeriodic) {
      this.nextPeriodic = now + 5;
      void this.queue.periodic().catch(() => {});
    }
    const cue = this.cuePolicy.select(this.findings, now, this.muted);
    if (cue && this.voice?.announceCue(`Observed in your recent reps: ${cue.note}`)) {
      this.cuePolicy.spoken(cue, now); this.metrics.cueAgeSec = now - cue.observedThroughSec;
    }
  }
  private async analyze(question?: string): Promise<LiveInspectionResult> {
    if (!this.active() || !this.recording) throw new Error('Camera is not ready.');
    const startedAt = performance.now();
    const window = this.frames.snapshot(this.id, this.clock());
    const recording = this.recording.pin(window.windowId, window.startSec, window.startSec + window.request.durationSec);
    this.callbacks.onAnalyzing(true);
    try {
      const result = await inspectLiveWindow({ window, ...(question ? { focus: { question } } : {}) }, this.abort.signal);
      if (!this.active()) throw new Error('Session ended.');
      if (result.window.sessionId !== this.id || result.window.windowId !== window.windowId || result.window.startSec !== window.startSec) throw new Error('Analysis belongs to another recording window.');
      validateReportForRequest(result.report, window.request);
      this.metrics.inspections++;
      this.metrics.analysisMs = performance.now() - startedAt;
      this.saved = retainCorrections(this.saved, result, recording);
      // Old findings remain useful for review but are never current spoken advice.
      if (this.clock() - (result.window.startSec + result.report.durationSec) <= 15) {
        this.latest = result;
        this.findings = mergeFindings(this.findings, result);
        this.callbacks.onFindings(this.findings);
        this.voice?.updateContext(this.context());
      }
      this.callbacks.onError('analysis', '');
      return result;
    } catch (error) {
      if (this.active()) this.callbacks.onError('analysis', error instanceof Error ? error.message : 'Analysis unavailable. Camera tracking can continue.');
      throw error;
    } finally { if (this.active()) this.callbacks.onAnalyzing(false); }
  }
  setMuted(muted: boolean) { this.muted = muted; this.voice?.setMuted(muted); }
  stop(): Promise<SessionReview> {
    if (this.stopPending) return this.stopPending;
    this.abort.abort(); this.queue.stop(); this.timers.forEach(clearInterval); this.timers = []; this.frames.clear();
    const recording = this.recording?.stop() ?? Promise.resolve({ id: 'recent', startSec: 0, endSec: 0, segments: [] });
    this.video.pause(); this.video.srcObject = null;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    const voice = this.voice?.disconnect().catch(error => this.callbacks.onError('voice', error instanceof Error ? error.message : 'Voice finalization could not be confirmed.'));
    this.stopPending = Promise.all([recording, voice, this.voicePending]).then(([recent]) => ({ recent, corrections: this.saved }));
    return this.stopPending;
  }
}
