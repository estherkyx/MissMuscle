import { AnalysisRequestSchema, LIMITS, type AnalysisRequest, type ExerciseId } from '../../../shared/contracts';

export interface LocalClip {
  id: string;
  name: string;
  url: string;
  durationSec: number;
  width: number;
  height: number;
}

export function validateFile(file: Pick<File, 'size'>) {
  if (!file.size) throw new Error('This file is empty. Choose a video clip.');
  if (file.size > LIMITS.clipBytes) throw new Error('Choose a clip no larger than 40 MiB.');
}

export function validateDuration(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > LIMITS.clipSeconds) {
    throw new Error('Choose a video longer than zero and no longer than 15 seconds.');
  }
}

export function scaledSize(width: number, height: number, edge: number = LIMITS.frameEdge) {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function sampleTimes(duration: number): number[] {
  validateDuration(duration);
  const end = duration - Math.min(0.05, duration / 20);
  return Array.from({ length: LIMITS.maxFrames }, (_, index) => index * end / (LIMITS.maxFrames - 1));
}

export function waitForMedia(video: HTMLVideoElement, event: string, signal: AbortSignal, start?: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const clean = () => {
      clearTimeout(timer);
      video.removeEventListener(event, ready);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const finish = (error?: unknown) => { clean(); if (error) reject(error); else resolve(); };
    const ready = () => finish();
    const failed = () => finish(new Error('This video could not be decoded. Try exporting it as an H.264 MP4.'));
    const aborted = () => finish(new DOMException('Video operation cancelled.', 'AbortError'));
    timer = setTimeout(() => finish(new Error(`Video ${event === 'seeked' ? 'seeking' : 'loading'} timed out. Try another clip.`)), 12_000);
    video.addEventListener(event, ready, { once: true });
    video.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) { aborted(); return; }
    try { start?.(); } catch (error) { finish(error); }
  });
}

function createVideo() {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  return video;
}

function releaseVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute('src');
  video.load();
}

export async function loadLocalClip(file: File, signal: AbortSignal): Promise<LocalClip> {
  validateFile(file);
  const url = URL.createObjectURL(file);
  const video = createVideo();
  try {
    await waitForMedia(video, 'loadedmetadata', signal, () => { video.src = url; video.load(); });
    signal.throwIfAborted();
    validateDuration(video.duration);
    if (!video.videoWidth || !video.videoHeight) throw new Error('No readable video track was found in this file.');
    return { id: crypto.randomUUID(), name: file.name, url, durationSec: video.duration, width: video.videoWidth, height: video.videoHeight };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally { releaseVideo(video); }
}

export function validatePayload(request: AnalysisRequest) {
  const parsed = AnalysisRequestSchema.parse(request);
  if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > LIMITS.requestBytes) {
    throw new Error('This video is too large to prepare for analysis. Try a lower-resolution clip.');
  }
  return parsed;
}

export async function extractFrames(clip: LocalClip, exerciseId: ExerciseId, signal: AbortSignal, onProgress: (count: number) => void): Promise<AnalysisRequest> {
  const video = createVideo();
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare the video for analysis.');
  const frames: AnalysisRequest['frames'] = [];
  try {
    await waitForMedia(video, 'loadeddata', signal, () => { video.src = clip.url; video.load(); });
    for (const timestamp of sampleTimes(clip.durationSec)) {
      signal.throwIfAborted();
      if (Math.abs(video.currentTime - timestamp) > 0.000001) {
        await waitForMedia(video, 'seeked', signal, () => { video.currentTime = timestamp; });
      }
      if (video.readyState < 2) await waitForMedia(video, 'loadeddata', signal);
      signal.throwIfAborted();
      let edge: number = LIMITS.frameEdge;
      let dataUrl = '';
      // Encoding is bounded; every capture is scaled from the original video.
      while (edge >= 96) {
        const size = scaledSize(video.videoWidth, video.videoHeight, edge);
        canvas.width = size.width;
        canvas.height = size.height;
        context.drawImage(video, 0, 0, size.width, size.height);
        for (const quality of [0.85, 0.7, 0.55, 0.4]) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          if (dataUrl.length <= LIMITS.frameDataUrlChars) break;
        }
        if (dataUrl.length <= LIMITS.frameDataUrlChars) break;
        edge = Math.floor(edge * 0.75);
      }
      if (dataUrl.length > LIMITS.frameDataUrlChars) throw new Error('This video could not be prepared for analysis. Try a lower-resolution export.');
      frames.push({ timestampSec: video.currentTime, dataUrl, width: canvas.width, height: canvas.height });
      onProgress(frames.length);
    }
    return validatePayload({ clipId: clip.id, exerciseId, durationSec: clip.durationSec, frames });
  } finally { releaseVideo(video); canvas.width = 0; canvas.height = 0; }
}
