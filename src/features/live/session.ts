import { coachingCueText, reviewSpeech } from './coaching-cue';
import { needsRepEndpoint } from './rep-evidence';
import { createRepActivity } from './rep-activity';
import type { Landmark } from '../video/muscle-regions';
import { getExercise } from '../../../shared/exercises';
import { LIVE_TIMING } from '../../../shared/live-timing';
import { validateReportForRequest, type LiveCoachContext, type LiveInspectionResult, type ExerciseId } from '../../../shared/contracts';
import { inspectLiveWindow } from '../../lib/api';
import { connectLiveCoach, CoachShutdownError, type LiveCoachConnection, type CoachStatus } from '../voice/coach-client';
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
  onAssessment?(result: LiveInspectionResult): void;
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
  private findings: LiveFinding[] = [];
  private saved: SavedCorrection[] = [];
  private cuePolicy = createCuePolicy();
  private muted = false;
  private introduced = false;
  private latestReview?: { result: LiveInspectionResult; receivedAt: number };
  private announcedReviewId?: string;
  private repActivity: ReturnType<typeof createRepActivity>;
  private nextPeriodic = Infinity;
  private frameCallback?: number;
  private metrics: SessionMetrics = { elapsedSec: 0, inspections: 0, analysisMs: null, cueAgeSec: null };
  private queue = createInspectionQueue((question?: string) => this.analyze(question));
  constructor(private video: HTMLVideoElement, private callbacks: SessionCallbacks,
    private exerciseId: ExerciseId = 'dumbbell_curl',
    private services = { inspect: inspectLiveWindow, connect: connectLiveCoach }) { this.repActivity=createRepActivity(exerciseId); }
  private clock = () => (performance.now() - this.origin) / 1000;
  private context(): LiveCoachContext { return { mode: 'live', guidanceOnly: true, sessionId: this.id, exerciseId: this.exerciseId, elapsedSec: this.clock(), latest: null }; }
  private active = () => !this.abort.signal.aborted;

  async start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Live exercise requires Chrome on HTTPS or localhost with camera recording support.');
    this.voicePending = this.services.connect({
      context: this.context(), signal: this.abort.signal,
      onStatus: status => { if (this.active()) this.callbacks.onStatus(status); },
      onError: message => { if (this.active()) this.callbacks.onError('voice', message); },
      onTranscript: entry => { if (this.active()) this.callbacks.onTranscript(entry); },
      onCueStarted: () => { if (this.active()) this.introduced = true; },
    }).then(async voice => {
      if (!this.active()) { await voice.disconnect(); return; }
      this.voice = voice; voice.setMuted(this.muted); voice.updateContext(this.context()); this.speak();
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
      let lastCapture = -Infinity;
      const capture = (time = this.clock()) => {
        if (!this.active() || time-lastCapture < LIVE_TIMING.captureMs/1000) return;
        try { this.frames.capture(this.video,time); lastCapture=time; }
        catch { this.callbacks.onError('analysis', 'Camera frames could not be prepared for analysis.'); }
      };
      if (this.video.requestVideoFrameCallback) {
        const frame: VideoFrameRequestCallback = (_now, metadata) => {
          if (!this.active()) return;
          // captureTime uses the same performance clock as this session and
          // accounts for camera/preview delay when supplied by the browser.
          const captured = metadata.captureTime === undefined ? this.clock() : (metadata.captureTime-this.origin)/1000;
          capture(Math.min(this.clock(),captured));
          this.frameCallback=this.video.requestVideoFrameCallback(frame);
        };
        this.frameCallback=this.video.requestVideoFrameCallback(frame);
      } else {
        capture(); this.timers.push(setInterval(capture, LIVE_TIMING.captureMs));
      }
      this.nextPeriodic = this.clock() + LIVE_TIMING.firstInspectionSec;
      this.timers.push(setInterval(() => this.tick(), 250));
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
      this.nextPeriodic = now + LIVE_TIMING.inspectionIntervalSec;
      void this.queue.periodic().catch(() => {});
    }
    this.speak();
  }
  private speak() {
    if(!this.active()||!this.recording||!this.voice||this.muted)return;
    const now=this.clock();
    const cue=this.cuePolicy.select(this.findings,now,false);
    if(cue) {
      if(this.voice.announceCue(coachingCueText(cue,this.exerciseId,this.latestReview?.result))) {
        this.announcedReviewId=cue.windowId;
        this.cuePolicy.spoken(cue,now);this.metrics.cueAgeSec=now-cue.observedThroughSec;
      }
      return;
    }
    const review=this.latestReview;
    if(review&&review.result.window.windowId!==this.announcedReviewId&&now-review.receivedAt<=12) {
      const fresh=review.result.report.formChecks?.some(check=>check.status!=='unclear'&&check.evidence.length&&
        now-(review.result.window.startSec+Math.max(...check.evidence.map(e=>e.timestampSec)))<=
          (check.status==='looks_consistent'?LIVE_TIMING.positiveEvidenceAgeSec:LIVE_TIMING.nudgeEvidenceAgeSec));
      // A fresh result waiting for its regular cooldown is not a delayed review.
      if(fresh)return;
      if(this.voice.announceCue(reviewSpeech(review.result))) this.announcedReviewId=review.result.window.windowId;
    } else if(!this.introduced&&!review) {
      // Admission is not playback. Retry after an adapter stall until real audio
      // starts; announceCue prevents queued/overlapping introductions.
      this.voice.announceCue(`Session introduction, not an assessment: I'm here to coach your ${getExercise(this.exerciseId)!.label.toLowerCase()} reps. I'll call out good reps and help with corrections.`);
    }
  }
  private async analyze(question?: string): Promise<LiveInspectionResult> {
    if (!this.active() || !this.recording) throw new Error('Camera is not ready.');
    const startedAt = performance.now();
    const window = this.frames.snapshot(this.id, this.clock(),this.exerciseId);
    const recording = this.recording.pin(window.windowId, window.startSec, window.startSec + window.request.durationSec);
    this.callbacks.onAnalyzing(true);
    try {
      const result = await this.services.inspect({ window, ...(question ? { focus: { question } } : {}) }, this.abort.signal);
      if (!this.active()) throw new Error('Session ended.');
      if (result.window.sessionId !== this.id || result.window.windowId !== window.windowId || result.window.startSec !== window.startSec) throw new Error('Analysis belongs to another recording window.');
      validateReportForRequest(result.report, window.request);
      this.metrics.inspections++;
      this.metrics.analysisMs = performance.now() - startedAt;
      this.saved = retainCorrections(this.saved, result, recording, window.request.frames);
      // Never discard a completed analysis because the provider was slow. Age
      // gates current coaching, while a delayed review is explicitly historical.
      this.latestReview={result,receivedAt:this.clock()};
      this.findings = mergeFindings(this.findings, result);
      this.callbacks.onFindings(this.findings);
      this.callbacks.onAssessment?.(result);
      this.voice?.updateContext(this.context());
      this.speak();
      this.callbacks.onError('analysis', '');
      return result;
    } catch (error) {
      if (this.active()) this.callbacks.onError('analysis', error instanceof Error ? error.message : 'Analysis unavailable. Camera tracking can continue.');
      throw error;
    } finally { if (this.active()) this.callbacks.onAnalyzing(false); }
  }
  setMuted(muted: boolean) { this.muted = muted; this.voice?.setMuted(muted); }
  observePose(poses: Landmark[][], width: number, height: number, capturedAtMs: number) {
    if (!this.active() || !this.recording) return;
    const time = (capturedAtMs - this.origin) / 1000;
    if (this.repActivity.update(poses, width, height, time)) this.recording.retainRepThrough(time);
    if(needsRepEndpoint(this.exerciseId)&&this.repActivity.latestRep)this.frames.retainRep(this.repActivity.latestRep);
  }
  stop(): Promise<SessionReview> {
    if (this.stopPending) return this.stopPending;
    this.abort.abort(); if(this.frameCallback!==undefined)this.video.cancelVideoFrameCallback(this.frameCallback); this.queue.stop(); this.timers.forEach(clearInterval); this.timers = []; this.frames.clear();
    const recording = this.recording?.stop() ?? Promise.resolve({ id: 'recent', startSec: 0, endSec: 0, segments: [] });
    this.video.pause(); this.video.srcObject = null;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    const voice = this.voice?.disconnect().catch(error => {
      if (!(error instanceof CoachShutdownError)) this.callbacks.onError('voice', error instanceof Error ? error.message : 'Voice could not stop.');
    });
    this.stopPending = Promise.all([recording, voice, this.voicePending]).then(([recent]) => ({ recent, corrections: this.saved }));
    return this.stopPending;
  }
}
