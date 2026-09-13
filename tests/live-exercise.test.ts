import test from 'node:test';
import assert from 'node:assert/strict';
import { FormCriterionIdSchema, LiveCoachContextSchema, LiveInspectionRequestSchema, type LiveInspectionResult } from '../shared/contracts';
import { demoReport } from '../shared/fixtures/demo-report';
import { createCuePolicy, createInspectionQueue, mergeFindings, retainCorrections } from '../src/features/live/findings';
import { RollingRecording, segmentAt, segmentsForRange, type RecordedSegment } from '../src/features/live/recording';
import { createLiveEventProcessor } from '../src/features/voice/live-events';

function findings(status: 'needs_attention' | 'looks_consistent' | 'unclear' = 'needs_attention', windowId = 'window-1'): LiveInspectionResult {
  return { window: { sessionId: 'session-1', windowId, startSec: 20 }, answer: 'Keep your wrist aligned with your forearm.', report: {
    ...demoReport, clipId: windowId, source: 'astra', durationSec: 10, corrections: [],
    formChecks: FormCriterionIdSchema.options.filter(id => ['steady_upper_arm', 'neutral_wrist', 'steady_torso', 'relaxed_shoulders', 'controlled_movement'].includes(id)).map(criterionId => ({ criterionId, status: criterionId === 'neutral_wrist' ? status : 'unclear', note: 'Keep your wrist aligned with your forearm.', evidence: criterionId === 'neutral_wrist' ? [{ frameIndex: 0, timestampSec: 1 }, { frameIndex: 1, timestampSec: 2 }] : [] })),
  } };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
test('live context starts without a report and separates session and window clocks', () => {
  assert.ok(LiveCoachContextSchema.safeParse({ mode: 'live', sessionId: 'session-1', exerciseId: 'dumbbell_curl', elapsedSec: 600, latest: null }).success);
  for (const exerciseId of ['lat_pulldown', 'leg_extension', 'dumbbell_front_squat']) {
    assert.equal(LiveCoachContextSchema.safeParse({ mode: 'live', sessionId: 'session-1', exerciseId, elapsedSec: 0, latest: null }).success, false);
  }
  assert.ok(LiveCoachContextSchema.safeParse({ mode: 'live', sessionId: 'session-1', exerciseId: 'dumbbell_curl', elapsedSec: 31, latest: findings() }).success);
  assert.equal(LiveCoachContextSchema.safeParse({ mode: 'live', sessionId: 'other-session', exerciseId: 'dumbbell_curl', elapsedSec: 31, latest: findings() }).success, false);
  assert.equal(LiveInspectionRequestSchema.safeParse({ window: { sessionId: 's', windowId: 'wrong', startSec: 500, request: { clipId: 'clip', exerciseId: 'dumbbell_curl', durationSec: 2, frames: [] } } }).success, false);
});
test('repeated criteria update a card; unclear findings never imply improvement', () => {
  const first = mergeFindings([], findings());
  assert.equal(first.length, 1);
  const repeated = mergeFindings(first, findings('needs_attention', 'window-2'));
  assert.equal(repeated.length, 1); assert.equal(repeated[0].windowId, 'window-2');
  assert.deepEqual(mergeFindings(repeated, findings('unclear')), repeated);
  assert.equal(mergeFindings(repeated, findings('looks_consistent'))[0].status, 'improved');
});
test('automatic cues respect evidence age, per-criterion cooldown and user interruptions', () => {
  const cues = createCuePolicy(); const list = mergeFindings([], findings());
  const first = cues.select(list, 31, false)!; assert.ok(first);
  cues.spoken(first, 31);
  assert.equal(cues.select(list, 40, false), undefined);
  assert.equal(cues.select(list, 46, false), undefined); // stale
  const fresh = [{ ...first, observedThroughSec: 60 }];
  assert.equal(cues.select(fresh, 60, false), undefined); // repeat cooldown
  assert.ok(cues.select(fresh, 61, false));
  cues.interrupt(61);
  assert.equal(cues.select(fresh, 63, false), undefined);
  assert.equal(cues.select(fresh, 67, true), undefined);
});
test('one visual request runs at a time and a question takes the next slot', async () => {
  const calls: Array<string | undefined> = []; const finish: Array<(value: string) => void> = [];
  const queue = createInspectionQueue<string>(question => { calls.push(question); return new Promise(resolve => finish.push(resolve)); });
  const first = queue.periodic(); const question = queue.inspect('What about my hands?');
  assert.equal(await queue.periodic(), undefined); assert.equal(calls.length, 1);
  finish[0]('periodic'); await first; await tick();
  assert.deepEqual(calls, [undefined, 'What about my hands?']);
  finish[1]('hands'); assert.equal(await question, 'hands');
  queue.stop(); await assert.rejects(queue.inspect('Again?'), /ended/);
});
test('stopping rejects a waiting question and never starts it after late completion', async () => {
  let finish!: (value: string) => void; let calls = 0;
  const queue = createInspectionQueue<string>(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const first = queue.periodic(); const question = queue.inspect('hands');
  const rejected = assert.rejects(question, /ended/); queue.stop(); await rejected;
  finish('late'); await first; assert.equal(calls, 1);
});
test('replay selects the next complete segment at a boundary and retains window offsets', () => {
  const segments: RecordedSegment[] = [0, 5, 10].map(startSec => ({ id: String(startSec), startSec, endSec: startSec + 5, blob: new Blob(['labelled test-only bytes']), ready: Promise.resolve() }));
  assert.equal(segmentAt(segments, 4.99)?.id, '0'); assert.equal(segmentAt(segments, 5)?.id, '5');
  assert.deepEqual(segmentsForRange(segments, 3, 13).map(s => s.id), ['0', '5', '10']);
  const recording = { id: 'window-1', startSec: 20, endSec: 30, segments };
  const saved = retainCorrections([], findings(), recording);
  assert.equal(saved[0].evidence[0].timestampSec + saved[0].recording.startSec, 21);
  assert.equal(retainCorrections(saved, findings('needs_attention', 'window-2'), recording).length, 1);
});
test('rolling recorder pins complete video-only segments beyond ring eviction', async t => {
  let now = 0;
  const videoTrack = { kind: 'video' }, microphoneTrack = { kind: 'audio' };
  const input = { getVideoTracks: () => [videoTrack], getTracks: () => [videoTrack, microphoneTrack] };
  class Stream { constructor(public tracks: unknown[]) {} }
  const recorders: Recorder[] = [];
  class Recorder {
    static isTypeSupported() { return true; }
    state = 'inactive'; ondataavailable?: (event: { data: Blob }) => void; onstop?: () => void; onerror?: () => void;
    constructor(public stream: Stream) { recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['complete fixture segment']) }); this.onstop?.(); }
  }
  const descriptors = new Map(['MediaStream', 'MediaRecorder', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'document', { value: { createElement: () => ({ canPlayType: () => 'probably' }) }, configurable: true });
  Object.defineProperty(globalThis, 'MediaStream', { value: Stream, configurable: true }); Object.defineProperty(globalThis, 'MediaRecorder', { value: Recorder, configurable: true });
  t.after(() => { for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  t.mock.timers.enable({ apis: ['setInterval'] });
  const recording = new RollingRecording(input as unknown as MediaStream, () => now, () => assert.fail('Unexpected recording error'));
  recording.start(); now = 5; t.mock.timers.tick(5000); now = 8;
  const pinned = recording.pin('evidence', 0, 8);
  for (const time of [10, 15, 20, 25]) { now = time; t.mock.timers.tick(5000); }
  assert.deepEqual(recorders[0].stream.tracks, [videoTrack]);
  assert.equal(pinned.segments.length, 2); assert.ok(pinned.segments.every(s => s.blob));
  now = 27; const recent = await recording.stop();
  assert.equal(recent.startSec, 17); assert.equal(recent.endSec, 27);
  assert.ok(recent.segments.every(s => s.startSec >= 15));
  assert.ok(recorders.every(r => r.state === 'inactive'));
});
test('fresh inspection tool awaits evidence and suppresses results after stop', async () => {
  let finish!: (value: LiveInspectionResult) => void;
  const sent: Record<string, unknown>[] = [];
  const processor = createLiveEventProcessor({ getContext: () => ({ mode: 'live', sessionId: 'session-1', exerciseId: 'dumbbell_curl', elapsedSec: 31, latest: null }), onInspect: () => new Promise(resolve => { finish = resolve; }), onCommand() { assert.fail('No playback in live mode'); }, send: e => sent.push(e), onTranscript() {}, onStarted() {}, onClosed() {}, onError() {} });
  const feed = (event: unknown) => processor.handle({ type: 'response.event', delegation_id: 'd', event });
  feed({ type: 'response.created', response: { id: 'r' } });
  feed({ type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c', name: 'inspect_movement', arguments: '{"question":"What about my hands?"}' } });
  feed({ type: 'response.completed', response: { id: 'r', output: [] } });
  assert.equal(sent.length, 0); processor.stop(); finish(findings()); await tick(); assert.equal(sent.length, 0);
});
