import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { connectCoach, connectLiveCoach, CoachShutdownError, type CoachOptions } from '../src/features/voice/coach-client';
import { demoReport } from '../shared/fixtures/demo-report';

function browser(t: TestContext) {
  const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  class Channel extends EventTarget {
    readyState = 'connecting';
    sent: Record<string, unknown>[] = [];
    send(value: string) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 'closed'; }
    receive(type: string, fields: Record<string, unknown> = {}) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type, ...fields }) })); }
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
  let audio!: Audio;
  class Audio {
    constructor() { audio=this; }
    autoplay = false;
    controls = false;
    muted = false;
    srcObject: unknown;
    setAttribute() {}
    playCalls=0;
    async play() {this.playCalls++;}
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
  return { channel, track, get audio() { return audio; }, get peer() { return peer; }, options, statuses, navigator: globals.navigator };
}

const answer = () => Response.json({ sessionId: 'test-session', sdpAnswer: 'v=0\r\nmock-answer' });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

for(const cause of ['timeout','lost transport']) test(`shutdown ${cause} stays in diagnostics while resources are released`,async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const app=browser(t),errors:string[]=[];
  const diagnostic=t.mock.method(console,'warn',()=>{});
  t.mock.method(globalThis,'fetch',async()=>answer());
  const connecting=connectCoach({...app.options,onError:message=>errors.push(message)});
  await tick();app.channel.receive('session.started');const connection=await connecting;
  const closing=connection.disconnect();
  const rejected=assert.rejects(closing,CoachShutdownError);
  if(cause==='timeout')t.mock.timers.tick(8000);
  else app.channel.dispatchEvent(new Event('close'));
  await rejected;
  assert.deepEqual(errors,[],'no user-facing finalization alert');
  assert.equal(diagnostic.mock.callCount(),1);
  assert.equal(app.statuses.at(-1),'idle');
  assert.equal(app.track.stopped,true);
  assert.equal(app.audio.muted,true);
  assert.equal(app.peer.connectionState,'closed');
});

test('transport failures during active coaching still notify the user',async t=>{
  const app=browser(t),errors:string[]=[];
  t.mock.method(globalThis,'fetch',async()=>answer());
  const connecting=connectCoach({...app.options,onError:message=>errors.push(message)});
  await tick();app.channel.receive('session.started');await connecting;
  app.channel.dispatchEvent(new Event('close'));
  assert.equal(errors.length,1);assert.match(errors[0],/reconnect/);
  assert.equal(app.statuses.at(-1),'error');
  assert.equal(app.track.stopped,true);
});

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


test('live coach starts before a report, updates findings without reconnecting, and mutes cues', async t => {
  const app = browser(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => answer());
  const context = { mode: 'live' as const, sessionId: 'exercise-session', exerciseId: 'dumbbell_curl' as const, elapsedSec: 0, latest: null };
  const connecting = connectLiveCoach({ ...app.options, context, onInspect: async () => { throw new Error('No frames yet'); } });
  await tick(); app.channel.receive('session.started'); const connection = await connecting;
  connection.updateContext({ ...context, elapsedSec: 100 });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(connection.announceCue('Test-only cue'), true);
  connection.setMuted(true); assert.equal(connection.announceCue('Must remain silent'), false);
  assert.throws(() => connection.updateContext({ ...context, sessionId: 'another' }), /End voice/);
  assert.throws(() => connection.updateContext({ ...context, exerciseId: 'leg_extension' }), /End voice before changing exercises/);
  const closing = connection.disconnect(); app.channel.receive('session.closed'); await closing;
  assert.equal(app.track.stopped, true);
});


test('automatic coaching keeps delayed real audio audible, prevents cue backlog and never requests the microphone', async t => {
  t.mock.timers.enable({apis:['Date','setTimeout']});
  const app = browser(t);
  const media = t.mock.method(app.navigator.mediaDevices, 'getUserMedia', async () => { throw new Error('Microphone must not be requested'); });
  const silentTrack = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const source = { offset: { value: 1 }, stopped: false, started: false, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } };
  let closed = false;
  let sounding=false, poll: (()=>void)|undefined, resumes=0;
  class Context {
    state='suspended';
    async resume() {resumes++;this.state='running';}
    async close() { closed = true; }
    createAnalyser() {return {fftSize:256,getByteTimeDomainData(samples:Uint8Array){samples.fill(sounding?140:128);}};}
    createMediaStreamSource() {return {connect(){}};}
    createMediaStreamDestination() { return { stream: { getTracks: () => [silentTrack], getAudioTracks: () => [silentTrack] } }; }
    createConstantSource() { return source; }
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: Context });
  Object.assign(window, { AudioContext: Context });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'AudioContext', descriptor); else Reflect.deleteProperty(globalThis, 'AudioContext'); });
  for(const [key,value] of Object.entries({
    MediaStream:class {constructor(_tracks:unknown[]){}},
    requestAnimationFrame:(callback:()=>void)=>{poll=callback;return 1;},
    cancelAnimationFrame:()=>{poll=undefined;},
  })) {
    const old=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true});
    t.after(()=>{if(old)Object.defineProperty(globalThis,key,old);else Reflect.deleteProperty(globalThis,key);});
  }
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init: RequestInit) => {
    assert.equal(JSON.parse(init.body as string).context.guidanceOnly, true);
    return answer();
  });
  const context = { mode: 'live' as const, guidanceOnly: true, sessionId: 'automatic-session', exerciseId: 'dumbbell_curl' as const, elapsedSec: 0, latest: null };
  const errors:string[]=[];
  let cueStarts=0;
  const connecting = connectLiveCoach({ context, onStatus: status => app.statuses.push(status), onTranscript() {},onError:message=>errors.push(message),onCueStarted:()=>{cueStarts++;} });
  await tick(); app.channel.receive('session.started'); const connection = await connecting;
  assert.equal(media.mock.callCount(), 0);
  assert.equal(source.offset.value, 0); assert.equal(source.started, true);
  assert.equal(app.statuses.at(-1), 'ready');
  assert.equal(app.audio.muted,false,'remote audio follows the user mute setting');
  assert.equal(connection.announceCue('Already expired.',{validForMs:0}),false);
  assert.equal(connection.announceCue('Keep your wrists aligned.',{validForMs:2000}), true);
  assert.equal(app.audio.muted,false);
  assert.equal(connection.announceCue('Do not queue overlapping commentary.'),false);
  assert.equal(app.channel.sent.at(-1)?.type, 'session.instructions.append');
  const instruction=app.channel.sent.at(-1)!;
  assert.match(String(instruction.content),/Keep your wrists aligned/,'the speech instruction contains the actual coaching content');
  app.channel.receive('session.instructions.appended',{client_event_id:'unrelated'});
  assert.equal(app.channel.sent.at(-1),instruction);
  app.channel.receive('session.instructions.appended',{client_event_id:instruction.event_id});
  assert.equal(app.channel.sent.at(-1)?.type,'session.commentary.append');
  assert.equal(connection.announceCue('Acknowledgment is not speech.'),false);
  assert.equal(cueStarts,0);
  t.mock.timers.tick(2001);
  assert.equal(app.audio.muted,false,'admitted speech remains audible after its admission deadline');
  assert.ok(app.audio.playCalls>0,'retry actual audio playback when submitting a cue');
  assert.equal(app.channel.sent.filter(e=>e.type==='session.instructions.append').length,1,'only the explicit speech trigger, no timer cancellation');
  assert.match(String(app.channel.sent.find(e=>e.type==='session.instructions.append')?.content),/without waiting for user speech/);
  assert.equal(connection.announceCue('Still waiting for the prior cue.'),false);
  t.mock.timers.tick(10_000);
  assert.match(errors.at(-1)!,/audio has not arrived/,'surface silent provider stalls');
  assert.equal(connection.announceCue('Fresh reviewed wrist reassurance.'),true,'a stalled provider does not block future cues forever');
  const sent=app.channel.sent.length;
  app.channel.receive('session.instructions.appended',{client_event_id:instruction.event_id});
  assert.equal(app.channel.sent.length,sent,'a late acknowledgment cannot trigger an expired cue');
  sounding=true;
  const event=new Event('track');Object.assign(event,{track:{}});app.peer.dispatchEvent(event);
  assert.equal(errors.at(-1),'','clear the stall notice when real audio arrives');
  assert.equal(app.statuses.at(-1),'speaking');
  assert.equal(cueStarts,1,'only actual remote audio marks the cue as started');
  assert.equal(connection.announceCue('Do not interrupt reassurance.'),false);
  sounding=false;t.mock.timers.tick(700);poll?.();
  assert.equal(app.statuses.at(-1),'ready');
  assert.equal(connection.announceCue('Next-rep wrist reminder.'),true,'real speech followed by silence releases the next update before the stall timeout');
  assert.ok(resumes>0,'the silent input audio clock is resumed');
  connection.setMuted(false);assert.equal(app.audio.muted,false);
  connection.setMuted(true); assert.equal(connection.announceCue('Muted correction'), false);
  const closing = connection.disconnect(); app.channel.receive('session.closed'); await closing;
  assert.equal(silentTrack.stopped, true); assert.equal(source.stopped, true); assert.equal(closed, true);
});
