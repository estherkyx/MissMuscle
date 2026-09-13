import type { AnalysisRequest, LiveWindow } from '../../../shared/contracts';


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
    return { id, startSec, endSec, segments: segmentsForRange(this.segments, startSec, endSec) };
  }
  async stop(): Promise<RecordingWindow> {
    this.stopped = true;
    clearInterval(this.timer);
    const endSec = this.clock();
    const recent = this.pin('recent', Math.max(0, endSec - 10), endSec);
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
    return recent;
  }
}

export class CameraFrames {
  private frames: Array<{ time: number; frame: AnalysisRequest['frames'][number] }> = [];
  private canvas = document.createElement('canvas');
  capture(video: HTMLVideoElement, time: number) {
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    const scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
    this.canvas.width = Math.round(video.videoWidth * scale); this.canvas.height = Math.round(video.videoHeight * scale);
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Camera frames could not be prepared.');
    context.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
    const frame = { timestampSec: 0, dataUrl: this.canvas.toDataURL('image/jpeg', 0.65), width: this.canvas.width, height: this.canvas.height };
    this.frames.push({ time, frame });
    this.frames = this.frames.filter(item => item.time >= time - 10).slice(-12);
  }
  snapshot(sessionId: string, now: number): LiveWindow {
    const recent = this.frames.filter(item => item.time >= now - 10);
    if (recent.length < 2) throw new Error('Still gathering movement. Analysis will start when enough frames are available.');
    const startSec = recent[0].time;
    const windowId = crypto.randomUUID();
    return { sessionId, windowId, startSec, request: {
      clipId: windowId, exerciseId: 'dumbbell_curl', durationSec: Math.max(0.01, now - startSec),
      frames: recent.map(item => ({ ...item.frame, timestampSec: item.time - startSec })),
    } };
  }
  clear() { this.frames = []; this.canvas.width = 0; this.canvas.height = 0; }
}
