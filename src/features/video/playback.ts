import { CoachCommandSchema, type AnalysisReport, type CoachCommand, type Correction } from '../../../shared/contracts';
import { waitForMedia } from './media';

export function validatePlaybackCommand(value: unknown, duration: number, report: AnalysisReport | null): CoachCommand {
  const command = CoachCommandSchema.parse(value);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Load a playable clip first.');
  if (command.type === 'show_correction') {
    const correction = report?.corrections.find(item => item.id === command.correctionId);
    if (!correction) throw new Error('This correction is not in the active report.');
    if (correction.evidence[0].timestampSec > duration) throw new Error('This evidence is outside the active clip.');
  }
  if (command.type === 'seek_video' && command.timestampSec > duration) throw new Error('The requested time is outside the active clip.');
  if (command.type === 'replay_segment' && command.endSec > duration) throw new Error('The replay segment is outside the active clip.');
  return command;
}

export function regionStyle(region: NonNullable<Correction['evidence'][number]['region']>) {
  return { left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` };
}

export interface PlaybackOptions {
  video: HTMLVideoElement;
  getDuration: () => number;
  getReport: () => AnalysisReport | null;
  onSelect: (correctionId: string, evidenceIndex: number) => void;
  onSettled: () => void;
  onError: (message: string) => void;
}

// Provider-independent controller. All async actions are invalidated by cancel().
export function createPlaybackController(options: PlaybackOptions) {
  const { video } = options;
  let operation: AbortController | null = null;
  let replayEnd: number | null = null;
  let animation: number | null = null;
  let disposed = false;
  let programmaticSeek: number | null = null;
  let ownedPauses = 0;

  function pause() {
    if (!video.paused) { ownedPauses++; video.pause(); }
  }

  function cancel() {
    operation?.abort();
    operation = null;
    replayEnd = null;
    programmaticSeek = null;
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null;
  }

  function checkEnd() {
    const end = replayEnd ?? options.getDuration();
    if (video.currentTime >= end) {
      pause();
      if (video.currentTime > end) video.currentTime = end;
      cancel();
      options.onSettled();
    }
  }

  function tick() {
    checkEnd();
    if (!disposed && !video.paused) animation = requestAnimationFrame(tick);
    else animation = null;
  }
  const onPlay = () => { if (animation === null) animation = requestAnimationFrame(tick); };
  const onPause = () => {
    if (ownedPauses > 0) ownedPauses--;
    else cancel();
    options.onSettled();
  };
  const onSeeking = () => {
    if (programmaticSeek !== null && Math.abs(video.currentTime - programmaticSeek) < 0.001) return;
    cancel();
  };
  const onSeeked = () => { programmaticSeek = null; options.onSettled(); };
  video.addEventListener('play', onPlay);
  video.addEventListener('pause', onPause);
  video.addEventListener('timeupdate', checkEnd);
  video.addEventListener('seeking', onSeeking);
  video.addEventListener('seeked', onSeeked);

  async function seek(timestamp: number, signal: AbortSignal) {
    if (Math.abs(video.currentTime - timestamp) < 0.001 && !video.seeking) return;
    programmaticSeek = timestamp;
    await waitForMedia(video, 'seeked', signal, () => { video.currentTime = timestamp; });
    signal.throwIfAborted();
  }

  async function execute(value: unknown, evidenceIndex = 0) {
    if (disposed) return;
    let current: AbortController | null = null;
    try {
      const command = validatePlaybackCommand(value, options.getDuration(), options.getReport());
      let timestamp: number | null = null;
      let selected: Correction | undefined;
      if (command.type === 'show_correction') {
        selected = options.getReport()!.corrections.find(c => c.id === command.correctionId)!;
        const evidence = selected.evidence[evidenceIndex];
        if (!evidence || evidence.timestampSec > options.getDuration()) throw new Error('This evidence is not available in the active clip.');
        timestamp = evidence.timestampSec;
      } else if (command.type === 'seek_video') timestamp = command.timestampSec;
      else if (command.type === 'replay_segment') timestamp = command.startSec;
      cancel();
      pause();
      current = new AbortController();
      operation = current;
      if (selected) options.onSelect(selected.id, evidenceIndex);
      if (timestamp !== null) await seek(timestamp, current.signal);
      current.signal.throwIfAborted();
      options.onSettled();
      if (command.type === 'replay_segment') {
        replayEnd = command.endSec;
        await video.play();
        if (current.signal.aborted || disposed) return;
      }
    } catch (error) {
      if (current?.signal.aborted) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      cancel();
      if (!disposed) options.onError(error instanceof Error ? error.message : 'Playback failed. Try the video play control.');
    }
  }

  return {
    handleCoachCommand: (command: CoachCommand) => { void execute(command); },
    showEvidence: (correctionId: string, evidenceIndex: number) => { void execute({ type: 'show_correction', correctionId }, evidenceIndex); },
    cancel,
    dispose() {
      disposed = true;
      cancel();
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', checkEnd);
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('seeked', onSeeked);
    },
  };
}
