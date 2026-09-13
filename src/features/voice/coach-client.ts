import { SessionCoachContextSchema, type CoachCommand, type CoachContext, type SessionCoachContext, type LiveCoachContext, type LiveInspectionResult } from '../../../shared/contracts';
import { buildCoachInstructions } from '../../../shared/coach-config';
import { startLiveSession } from '../../lib/api';
import { createLiveEventProcessor } from './live-events';

// Person B owns this browser adapter as well as server/live/.
// Person A consumes this interface without needing OpenAI event knowledge.
export type CoachStatus = 'idle' | 'connecting' | 'ready' | 'listening' | 'speaking' | 'error';
export interface CoachOptions {
  context: CoachContext;
  onStatus: (status: CoachStatus) => void;
  onCommand: (command: CoachCommand) => void;
  onTranscript: (entry: { role: 'user' | 'coach'; text: string; final: boolean }) => void;
  // Optional additions: existing Person A callers remain compatible.
  onError?: (message: string) => void;
  signal?: AbortSignal;
}
export interface CoachConnection {
  updateContext(context: CoachContext): void;
  disconnect(): Promise<void>;
}

export interface LiveCoachOptions extends Omit<CoachOptions, 'context' | 'onCommand'> {
  context: LiveCoachContext;
  onInspect?(question: string): Promise<LiveInspectionResult>;
  onInspectionBusy?(busy: boolean): void;
  onUserActivity?(): void;
}
export interface LiveCoachConnection {
  updateContext(context: LiveCoachContext): void;
  announceCue(text: string): boolean;
  setMuted(muted: boolean): void;
  disconnect(): Promise<void>;
}
type AnyOptions = Omit<CoachOptions, 'context' | 'onCommand'> & {
  context: SessionCoachContext; onCommand?: CoachOptions['onCommand'];
  onInspect?: LiveCoachOptions['onInspect'];
  onInspectionBusy?: LiveCoachOptions['onInspectionBusy'];
  onUserActivity?: () => void;
};
export function connectCoach(options: CoachOptions): Promise<CoachConnection> { return connectAnyCoach(options); }
export function connectLiveCoach(options: LiveCoachOptions): Promise<LiveCoachConnection> { return connectAnyCoach(options); }
async function connectAnyCoach(options: AnyOptions) {
  let context = SessionCoachContextSchema.parse(options.context);
  const guidanceOnly = 'mode' in context && context.guidanceOnly === true;
  const waitingStatus = guidanceOnly ? 'ready' : 'listening';
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
    throw new Error('Voice requires a supported browser on HTTPS or localhost.');
  }
  if (options.signal?.aborted) throw new Error('Voice connection cancelled.');
  options.onStatus('connecting');
  const peer = new RTCPeerConnection();
  const channel = peer.createDataChannel('oai-events');
  const audio = new Audio();
  audio.autoplay = true;
  audio.controls = true;
  audio.setAttribute('aria-label', 'Coach audio — press play if your browser blocks sound');
  let microphone: MediaStream | undefined;
  let silentSource: ConstantSourceNode | undefined;
  let ready = false;
  let disposed = false;
  let closing = false;
  let finalized = false;
  let sessionRequested = false;
  let closeSent = false;
  let lastContextSentAt = 0;
  let lastUserActivity = -Infinity;
  let inspecting = false;
  let muted = false;
  let contextTimer: ReturnType<typeof setTimeout> | undefined;
  let connectionTimer: ReturnType<typeof setTimeout> | undefined;
  let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let closePromise: Promise<void> | undefined;
  let closeResolve: (() => void) | undefined;
  let closeReject: ((error: Error) => void) | undefined;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const started = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // Attach immediately so a transport failure during SDP exchange cannot be unhandled.
  void started.catch(() => {});
  let meter: AudioContext | undefined;
  let meterFrame: number | undefined;
  let lastStatus: CoachStatus = 'connecting';
  function status(next: CoachStatus) {
    if (next !== lastStatus) { lastStatus = next; options.onStatus(next); }
  }
  function send(event: Record<string, unknown>) {
    if (!disposed && channel.readyState === 'open') channel.send(JSON.stringify(event));
  }
  function cleanup() {
    if (disposed) return;
    disposed = true;
    ready = false;
    clearTimeout(contextTimer);
    clearTimeout(connectionTimer);
    clearTimeout(disconnectTimer);
    if (meterFrame !== undefined) cancelAnimationFrame(meterFrame);
    silentSource?.stop(); silentSource?.disconnect();
    if (meter) void meter.close().catch(() => {});
    microphone?.getTracks().forEach(track => track.stop());
    audio.pause(); audio.srcObject = null; audio.remove();
    processor.stop();
    channel.close(); peer.close();
    window.removeEventListener('pagehide', onPageHide);
    options.signal?.removeEventListener('abort', onAbort);
  }
  function fail(message: string) {
    if (disposed) return;
    rejectReady(new Error(message));
    closeReject?.(new Error(message));
    status('error');
    options.onError?.(message);
    cleanup();
  }
  function pushContext() {
    clearTimeout(contextTimer);
    contextTimer = undefined;
    if (!ready || closing || disposed) return;
    lastContextSentAt = Date.now();
    send({ type: 'session.update', event_id: crypto.randomUUID(), session: { delegation: { type: 'responses', responses: { instructions: buildCoachInstructions(context) } } } });
  }
  const processor = createLiveEventProcessor({
    getContext: () => context,
    onCommand: command => options.onCommand?.(command),
    onInspect: options.onInspect,
    onInspectionBusy: busy => { inspecting = busy; options.onInspectionBusy?.(busy); },
    onTranscript: entry => {
      if (entry.role === 'user') { lastUserActivity = Date.now(); options.onUserActivity?.(); }
      options.onTranscript(entry);
    },
    send,
    onStarted() {
      if (ready || disposed) return;
      ready = true;
      if (closing) { sendCloseWhenReady(); return; }
      status(waitingStatus);
      resolveReady();
      pushContext();
    },
    onClosed() {
      finalized = true;
      rejectReady(new Error('The voice session ended before startup completed.'));
      closeResolve?.();
      cleanup();
      status('idle');
    },
    onError: fail,
  });

  function sendCloseWhenReady() {
    if (!closing || !ready || closeSent || channel.readyState !== 'open') return;
    closeSent = true;
    clearTimeout(connectionTimer);
    clearTimeout(disconnectTimer);
    disconnectTimer = setTimeout(() => {
      fail('Coach audio stopped, but OpenAI did not confirm session finalization. Final usage is unconfirmed.');
    }, 8000);
    send({ type: 'session.close', event_id: crypto.randomUUID() });
  }

  async function disconnect(): Promise<void> {
    if (closePromise) return closePromise;
    if (disposed) return;
    closing = true;
    processor.stop();
    clearTimeout(contextTimer);
    // Mute immediately; release the devices once final events drain over WebRTC.
    microphone?.getTracks().forEach(track => { track.enabled = false; });
    audio.muted = true;
    if (!sessionRequested) { cleanup(); status('idle'); return; }
    closePromise = new Promise<void>((resolve, reject) => {
      closeResolve = resolve; closeReject = reject;
      // If cancelled during POST, finish applying the answer so the resulting
      // session can receive session.close. Do not discard a late successful SDP.
      disconnectTimer = setTimeout(() => {
        fail('Voice startup cancellation timed out. Final provider usage is unconfirmed.');
      }, 50_000);
    });
    sendCloseWhenReady();
    return closePromise;
  }
  function onAbort() {
    void disconnect().catch(() => {});
    if (!sessionRequested) rejectReady(new Error('Voice connection cancelled.'));
  }
  function onPageHide() {
    if (ready) send({ type: 'session.close', event_id: crypto.randomUUID() });
    // Page unload cannot await confirmation; never report this as finalized.
    cleanup();
  }
  options.signal?.addEventListener('abort', onAbort, { once: true });
  window.addEventListener('pagehide', onPageHide);
  channel.addEventListener('message', event => {
    try { processor.handle(JSON.parse(String(event.data))); }
    catch { fail('The voice connection received an invalid event. Please reconnect.'); }
  });
  channel.addEventListener('close', () => {
    if (!disposed && !finalized) fail('The voice connection was lost before finalization. Please reconnect.');
  });
  channel.addEventListener('error', () => fail('The voice data connection failed. Please reconnect.'));
  peer.addEventListener('connectionstatechange', () => {
    if (peer.connectionState === 'failed') fail('The voice media connection failed. Check your network and reconnect.');
  });
  peer.addEventListener('track', event => {
    const stream = new MediaStream([event.track]);
    audio.srcObject = stream;
    void audio.play().catch(() => {
      if (disposed) return;
      // Real audio controls provide a recovery gesture without changes to Person A's UI.
      document.body.append(audio);
      options.onError?.('Your browser blocked coach audio. Press play on the audio controls below.');
    });
    if (meter) {
      const analyser = meter.createAnalyser();
      analyser.fftSize = 256;
      meter.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let lastSound = 0;
      const poll = () => {
        if (disposed || closing) return;
        analyser.getByteTimeDomainData(samples);
        const energy = samples.reduce((total, v) => total + (v - 128) ** 2, 0) / samples.length;
        if (energy > 6) lastSound = Date.now();
        if (ready && lastStatus !== 'error') status(Date.now() - lastSound < 250 ? 'speaking' : waitingStatus);
        meterFrame = requestAnimationFrame(poll);
      };
      poll();
    }
  });

  try {
    // Resume during the user's start gesture; audio remains on the remote media track.
    if (window.AudioContext) {
      meter = new AudioContext();
      void meter.resume().catch(() => {});
    }
    let stream: MediaStream;
    if (guidanceOnly) {
      if (!meter) throw new Error('Automatic spoken coaching requires Web Audio support.');
      // GPT-Live requires an active input audio clock for commentary delivery.
      // Send generated silence, never microphone input or substitute coach audio.
      const destination = meter.createMediaStreamDestination();
      silentSource = meter.createConstantSource(); silentSource.offset.value = 0;
      silentSource.connect(destination); silentSource.start();
      stream = destination.stream;
    } else {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    }
    if (disposed) { stream.getTracks().forEach(track => track.stop()); throw new Error('Voice connection cancelled.'); }
    microphone = stream;
    stream.getAudioTracks().forEach(track => peer.addTrack(track, stream));
    await peer.setLocalDescription(await peer.createOffer());
    if (peer.iceGatheringState !== 'complete') {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { peer.removeEventListener('icegatheringstatechange', check); reject(new Error('Timed out preparing the voice connection.')); }, 10_000);
        function check() {
          if (disposed || peer.iceGatheringState === 'complete') {
            clearTimeout(timeout); peer.removeEventListener('icegatheringstatechange', check);
            if (disposed) reject(new Error('Voice connection cancelled.')); else resolve();
          }
        }
        peer.addEventListener('icegatheringstatechange', check); check();
      });
    }
    if (disposed) throw new Error('Voice connection cancelled.');
    const sdpOffer = peer.localDescription?.sdp;
    if (!sdpOffer) throw new Error('The browser could not create a voice offer.');
    sessionRequested = true;
    const session = await startLiveSession({ sdpOffer, context });
    if (disposed) throw new Error('Voice connection cancelled during startup.');
    await peer.setRemoteDescription({ type: 'answer', sdp: session.sdpAnswer });
    // HTTP already started the session: never send session.start here.
    if (!disposed && !closeSent) connectionTimer = setTimeout(() => fail('OpenAI did not start the voice session in time. Final provider usage is unconfirmed.'), 15_000);
    await started;
    clearTimeout(connectionTimer);
    return {
      updateContext(next: SessionCoachContext) {
        if (disposed || closing) return;
        const parsed = SessionCoachContextSchema.parse(next);
        if (('mode' in parsed) !== ('mode' in context)) throw new Error('End voice before changing modes.');
        let selectionChanged = false;
        if ('mode' in parsed && 'mode' in context) {
          if (parsed.guidanceOnly !== context.guidanceOnly) throw new Error('End voice before changing microphone mode.');
          if (parsed.sessionId !== context.sessionId) throw new Error('End voice before changing live sessions.');
          selectionChanged = parsed.latest?.window.windowId !== context.latest?.window.windowId;
          if (selectionChanged && parsed.latest) send({ type: 'session.thinking.append', event_id: crypto.randomUUID(), delegation_id: null,
            content: JSON.stringify({ capturedThroughSec: parsed.latest.window.startSec + parsed.latest.report.durationSec, summary: parsed.latest.answer }).slice(0, 1200) });
        } else if (!('mode' in parsed) && !('mode' in context)) {
          if (parsed.report.id !== context.report.id || parsed.report.clipId !== context.report.clipId) throw new Error('End the current voice session before changing clips or reports.');
          selectionChanged = parsed.selectedCorrectionId !== context.selectedCorrectionId;
        }
        context = parsed;
        if (selectionChanged || Date.now() - lastContextSentAt >= 1000) pushContext();
        else if (!contextTimer) contextTimer = setTimeout(() => { contextTimer = undefined; pushContext(); }, 1000 - (Date.now() - lastContextSentAt));
      },
      announceCue(text: string) {
        if (!ready || disposed || closing || muted || inspecting || lastStatus === 'speaking' || Date.now() - lastUserActivity < 5000) return false;
        send({ type: 'session.commentary.append', event_id: crypto.randomUUID(), delegation_id: null, content: text.slice(0, 1000) });
        return true;
      },
      setMuted(value: boolean) { muted = value; audio.muted = value; },
      disconnect,
    };
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'NotAllowedError'
      ? 'Microphone permission was denied. Allow microphone access, then try again.'
      : error instanceof Error ? error.message : 'Voice could not connect.';
    if (!disposed) fail(message);
    throw new Error(message);
  }
}
