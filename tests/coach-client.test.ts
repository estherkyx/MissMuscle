import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { connectCoach, type CoachOptions } from '../src/features/voice/coach-client';
import { demoReport } from '../shared/fixtures/demo-report';

function browser(t: TestContext) {
  const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  class Channel extends EventTarget {
    readyState = 'connecting';
    sent: Record<string, unknown>[] = [];
    send(value: string) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 'closed'; }
    receive(type: string) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type }) })); }
  }
  const channel = new Channel();
  let peer!: Peer;
  class Peer extends EventTarget {
    iceGatheringState = 'complete';
    connectionState = 'new';
    localDescription = { sdp: 'v=0\r\nmock-offer' };
    remoteApplied = false;
    constructor() { super(); peer = this; }
    createDataChannel() { return channel; }
    addTrack() {}
    async createOffer() { return this.localDescription; }
    async setLocalDescription() {}
    async setRemoteDescription() { this.remoteApplied = true; channel.readyState = 'open'; }
    close() { this.connectionState = 'closed'; }
  }
  class Audio {
    autoplay = false;
    controls = false;
    muted = false;
    srcObject: unknown;
    setAttribute() {}
    pause() {}
    remove() {}
  }
  const window = Object.assign(new EventTarget(), { isSecureContext: true, RTCPeerConnection: Peer });
  const globals = { window, navigator: { mediaDevices: { getUserMedia: async () => stream } }, RTCPeerConnection: Peer, Audio };
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const statuses: string[] = [];
  const options: CoachOptions = {
    context: { report: demoReport, currentTimeSec: 0, selectedCorrectionId: null },
    onCommand() {}, onTranscript() {}, onStatus: status => statuses.push(status),
  };
  return { channel, track, get peer() { return peer; }, options, statuses, navigator: globals.navigator };
}

const answer = () => Response.json({ sessionId: 'test-session', sdpAnswer: 'v=0\r\nmock-answer' });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('disconnect mutes immediately and retains the transport until provider finalization', async t => {
  const app = browser(t);
  t.mock.method(globalThis, 'fetch', async () => answer());
  const connecting = connectCoach(app.options);
  await tick();
  assert.equal(app.statuses.at(-1), 'connecting');
  app.channel.receive('session.started');
  const connection = await connecting;
  assert.equal(app.statuses.at(-1), 'listening');
  const closing = connection.disconnect();
  assert.equal(app.track.enabled, false);
  assert.equal(app.track.stopped, false);
  assert.equal(app.channel.readyState, 'open');
  assert.equal(app.channel.sent.filter(e => e.type === 'session.close').length, 1);
  app.channel.receive('session.closed');
  await closing;
  assert.equal(app.track.stopped, true);
  assert.equal(app.peer.connectionState, 'closed');
  assert.equal(app.statuses.at(-1), 'idle');
});

test('cancelling an in-flight handshake still closes the late provider session', async t => {
  const app = browser(t);
  let finish!: (response: Response) => void;
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>(resolve => { finish = resolve; }));
  const controller = new AbortController();
  const connecting = connectCoach({ ...app.options, signal: controller.signal });
  const rejected = assert.rejects(connecting, /ended before startup/);
  await tick();
  controller.abort();
  assert.equal(app.track.enabled, false);
  assert.notEqual(app.peer.connectionState, 'closed');
  finish(answer());
  await tick();
  assert.equal(app.peer.remoteApplied, true);
  app.channel.receive('session.started');
  assert.equal(app.channel.sent.filter(e => e.type === 'session.close').length, 1);
  assert.equal(app.statuses.includes('listening'), false);
  app.channel.receive('session.closed');
  await rejected;
  assert.equal(app.track.stopped, true);
  assert.equal(app.peer.connectionState, 'closed');
});

test('denied microphone permission releases the transport without a provider request', async t => {
  const app = browser(t);
  t.mock.method(app.navigator.mediaDevices, 'getUserMedia', async () => { throw new DOMException('Denied', 'NotAllowedError'); });
  const fetch = t.mock.method(globalThis, 'fetch', async () => answer());
  await assert.rejects(connectCoach(app.options), /Microphone permission was denied/);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(app.peer.connectionState, 'closed');
  assert.equal(app.statuses.at(-1), 'error');
});
