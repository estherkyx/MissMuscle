import { LIVE_TIMING } from '../../../shared/live-timing';
import type { AnalysisRequest, LiveWindow, ExerciseId } from '../../../shared/contracts';
import type { RepTiming } from './rep-activity';
import { needsRepEndpoint, selectRepEvidence } from './rep-evidence';


export function chooseRecordingType(supportsRecording: (type: string) => boolean, supportsPlayback: (type: string) => boolean): string {
  const type = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm'].find(type => supportsRecording(type) && supportsPlayback(type));
  if (!type) throw new Error('This browser has no supported recording and replay format. Try a current Chrome browser.');
  return type;
}

export interface RecordedSegment {
  id: string;
  startSec: number;
  endSec: number;
  blob: Blob | null;
  ready: Promise<void>;
}
export interface RecordingWindow {
  id: string;
  startSec: number;
  endSec: number;
  segments: RecordedSegment[];
}
export function segmentsForRange(segments: RecordedSegment[], startSec: number, endSec: number) {
  return segments.filter(segment => segment.startSec < endSec && segment.endSec > startSec);
}
export function segmentAt(segments: RecordedSegment[], time: number) {
  return [...segments].reverse().find(segment => segment.startSec <= time && segment.endSec > time && segment.blob);
}

// Each segment comes from a complete MediaRecorder start/stop, including its own
// container header. Replay switches sources, never concatenates arbitrary chunks.
export class RollingRecording {
  private segments: RecordedSegment[] = [];
  private active: { recorder: MediaRecorder; segment: RecordedSegment } | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;
  private lastReps: RecordingWindow | undefined;
  private videoStream: MediaStream;
  constructor(stream: MediaStream, private clock: () => number, private onError: (message: string) => void) {
    this.videoStream = new MediaStream(stream.getVideoTracks());
  }
  start() {
    this.rotate();
    this.timer = setInterval(() => this.rotate(), 5000);
  }
  private rotate() {
    if (this.stopped) return;
    try {
      const playback = document.createElement('video');
      const mimeType = chooseRecordingType(type => MediaRecorder.isTypeSupported(type), type => playback.canPlayType(type) !== '');
      const recorder = new MediaRecorder(this.videoStream, { mimeType, videoBitsPerSecond: 1_500_000 });
      const chunks: Blob[] = [];
      let finish!: () => void;
      const segment: RecordedSegment = { id: crypto.randomUUID(), startSec: this.clock(), endSec: Infinity, blob: null, ready: new Promise(resolve => { finish = resolve; }) };
      recorder.onstart = event => { segment.startSec = this.clock() - Math.max(0,performance.now()-event.timeStamp)/1000; };
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { this.onError('Recent video could not be recorded. Camera tracking can continue.'); finish(); };
      recorder.onstop = () => { segment.blob = chunks.length ? new Blob(chunks, { type: recorder.mimeType || chunks[0].type || mimeType }) : null; finish(); };
      recorder.start();
      const old = this.active;
      this.active = { recorder, segment };
      this.segments.push(segment);
      if (old) { old.segment.endSec = this.clock(); if (old.recorder.state !== 'inactive') old.recorder.stop(); }
      // Windows already pinned by analysis retain their own references.
      this.segments = this.segments.filter(item => item.endSec >= this.clock() - 10);
    } catch (error) {
      this.onError(error instanceof Error ? error.message : 'Recording unavailable.');
      clearInterval(this.timer);
    }
  }
  pin(id: string, startSec: number, endSec: number): RecordingWindow {
    const retained=[...new Map([...(this.lastReps?.segments??[]),...this.segments].map(segment=>[segment.id,segment])).values()];
    return { id, startSec, endSec, segments: segmentsForRange(retained, startSec, endSec) };
  }
  retainRepThrough(time: number) {
    if (this.stopped || !Number.isFinite(time) || time <= (this.lastReps?.endSec ?? 0) || time > this.clock()) return;
    // Pin now: an arbitrarily long walk to the controls must not evict the reps.
    const startSec = Math.max(0, time - 10, this.segments[0]?.startSec ?? 0);
    if (time > startSec) this.lastReps = this.pin('last-reps', startSec, time);
  }
  async stop(): Promise<RecordingWindow> {
    this.stopped = true;
    clearInterval(this.timer);
    const endSec = this.clock();
    const recent = this.lastReps ?? this.pin('recent', Math.max(0, endSec - 10, this.segments[0]?.startSec ?? 0), endSec);
    if (this.active) {
      this.active.segment.endSec = endSec;
      if (this.active.recorder.state !== 'inactive') this.active.recorder.stop();
      this.active = null;
    }
    // A recorder failure must not keep devices or the UI stuck indefinitely.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.all(recent.segments.map(item => item.ready)), new Promise(resolve => { timer = setTimeout(resolve, 2000); })]);
    clearTimeout(timer);
    this.segments = [];
    this.lastReps = undefined;
    return recent;
  }
}

export class CameraFrames {
  private frames: Array<{ time: number; frame: AnalysisRequest['frames'][number] }> = [];
  private canvas = document.createElement('canvas');
  private repTiming?: RepTiming;
  private repFrames?: Array<{ time: number; frame: AnalysisRequest['frames'][number] }>;
  private submittedRepPeak=-Infinity;
  retainRep(rep: RepTiming) {
    if(this.repTiming&&rep.peakSec<this.repTiming.peakSec)return;
    if(this.repTiming?.peakSec!==rep.peakSec)this.repFrames=undefined;
    this.repTiming=rep;
    const available=[...new Map([...(this.repFrames??[]),...this.frames].map(frame=>[frame.time,frame])).values()].sort((a,b)=>a.time-b.time);
    const selected=selectRepEvidence(available,rep);
    if(selected)this.repFrames=selected;
  }
  capture(video: HTMLVideoElement, time: number) {
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight || !Number.isFinite(time) || time < 0 || time <= (this.frames.at(-1)?.time ?? -Infinity)) return;
    const scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
    this.canvas.width = Math.round(video.videoWidth * scale); this.canvas.height = Math.round(video.videoHeight * scale);
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Camera frames could not be prepared.');
    context.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
    const frame = { timestampSec: 0, dataUrl: this.canvas.toDataURL('image/jpeg', 0.65), width: this.canvas.width, height: this.canvas.height };
    this.frames.push({ time, frame });
    this.frames = this.frames.filter(item => item.time >= time - LIVE_TIMING.repBufferSec).slice(-LIVE_TIMING.repBufferFrames);
    if(this.repTiming)this.retainRep(this.repTiming);
  }
  snapshot(sessionId: string, now: number, exerciseId: ExerciseId = 'dumbbell_curl'): LiveWindow {
    const rep=needsRepEndpoint(exerciseId)&&this.repTiming&&this.repFrames&&
      this.repTiming.peakSec>this.submittedRepPeak&&now-this.repFrames.at(-1)!.time<=LIVE_TIMING.repBufferSec?this.repFrames:null;
    const recent = rep ?? this.frames.filter(item => item.time >= now - LIVE_TIMING.windowSec).slice(-LIVE_TIMING.maxFrames);
    if (recent.length < 2) throw new Error('Still gathering movement. Analysis will start when enough frames are available.');
    // Keep the full time span and endpoints, with fewer images to inspect.
    const count = Math.min(recent.length, LIVE_TIMING.analysisFrames);
    const submitted = Array.from({ length: count }, (_, i) => recent[Math.round(i * (recent.length - 1) / (count - 1))]);
    const startSec = submitted[0].time;
    const windowId = crypto.randomUUID();
    if(rep)this.submittedRepPeak=this.repTiming!.peakSec;
    return { sessionId, windowId, startSec, request: {
      clipId: windowId, exerciseId, durationSec: Math.max(0.01, submitted.at(-1)!.time - startSec),
      frames: submitted.map(item => ({ ...item.frame, timestampSec: item.time - startSec })),
    } };
  }
  clear() { this.frames = []; this.repTiming=undefined;this.repFrames=undefined;this.submittedRepPeak=-Infinity;this.canvas.width = 0; this.canvas.height = 0; }
}
