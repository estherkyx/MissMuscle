import test from 'node:test';
import assert from 'node:assert/strict';
import { FormCriterionIdSchema, LiveCoachContextSchema, LiveInspectionRequestSchema, type LiveInspectionResult } from '../shared/contracts';
import { coachingCueText } from '../src/features/live/coaching-cue';
import { demoReport } from '../shared/fixtures/demo-report';
import { createCuePolicy, createInspectionQueue, mergeFindings, retainCorrections, correctionReplayOffset } from '../src/features/live/findings';
import { CameraFrames, RollingRecording, segmentAt, segmentsForRange, type RecordedSegment } from '../src/features/live/recording';
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
    assert.equal(LiveCoachContextSchema.safeParse({ mode: 'live', sessionId: 'session-1', exerciseId, elapsedSec: 0, latest: null }).success, true);
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
  assert.equal(mergeFindings(repeated, findings('looks_consistent'))[0].status, 'needs_attention');
  const later=findings('looks_consistent');later.window.startSec=23;
  assert.equal(mergeFindings(repeated, later)[0].status, 'improved');
});
test('automatic cues respect evidence age, per-criterion cooldown and user interruptions', () => {
  const cues = createCuePolicy(); const list = mergeFindings([], findings());
  assert.equal(list[0].observedThroughSec,22,'uses evidence time, not window end at 30');
  const first = cues.select(list, 23, false)!; assert.ok(first);
  cues.spoken(first, 23);
  assert.equal(cues.select(list, 25, false), undefined);
  assert.equal(cues.select(list, 29, false)?.kind, 'nudge');
  cues.spoken(cues.select(list,29,false)!,29);
  const fresh = [{ ...first, windowId:'new-window', observedThroughSec: 34 }];
  assert.equal(cues.select(fresh, 34, false), undefined); // repeat cooldown
  assert.ok(cues.select(fresh, 35, false));
  cues.interrupt(35);
  assert.equal(cues.select(fresh, 37, false), undefined);
  assert.equal(cues.select(fresh, 41, true), undefined);
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
  assert.equal(correctionReplayOffset(saved[0],saved[0].evidence[0].timestampSec) + saved[0].recording.startSec, 21);
  assert.equal(retainCorrections(saved, findings('needs_attention', 'window-2'), recording).length, 1);
});
for (const preserveRep of [false, true]) test(`rolling recorder retains ${preserveRep ? 'last reps despite a long delay before stopping' : 'recent video without rep timing'}`, async t => {
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
  if (preserveRep) {
    recording.retainRepThrough(8);
    recording.retainRepThrough(7); // older detections cannot replace the last rep
    recording.retainRepThrough(100); // nor can a future timestamp
  }
  for (const time of [10, 15, 20, 25]) { now = time; t.mock.timers.tick(5000); }
  assert.deepEqual(recorders[0].stream.tracks, [videoTrack]);
  assert.equal(pinned.segments.length, 2); assert.ok(pinned.segments.every(s => s.blob));
  now = 27;
  if(preserveRep) assert.deepEqual(recording.pin('late-review',0,8).segments.map(s=>s.startSec),[0,5],'rep evidence remains available after ring eviction');
  const recent = await recording.stop();
  assert.equal(recent.startSec, preserveRep ? 0 : 17); assert.equal(recent.endSec, preserveRep ? 8 : 27);
  assert.equal(recent.id, preserveRep ? 'last-reps' : 'recent');
  assert.ok(recent.segments.every(s => s.blob));
  if (preserveRep) assert.deepEqual(recent.segments.map(s => s.startSec), [0, 5]);
  else assert.ok(recent.segments.every(s => s.startSec >= 15));
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

test('late results retain the cited recording moment and frame despite different cropped clip origins', () => {
  const segments: RecordedSegment[]=[20,25,30].map(startSec=>({id:String(startSec),startSec,endSec:startSec+5,blob:new Blob(['test']),ready:Promise.resolve()}));
  const result=findings();
  result.report.formChecks![1].evidence=[{frameIndex:0,timestampSec:4.8},{frameIndex:1,timestampSec:5.2}];
  const frames=[4.8,5.2].map((timestampSec,i)=>({timestampSec,width:1,height:1,dataUrl:`data:image/jpeg;base64,test-${i}`}));
  const saved=retainCorrections([],result,{id:'window',startSec:20,endSec:30,segments},frames)[0];
  assert.ok(Math.abs(saved.recording.startSec-24.05)<1e-7);
  assert.equal(saved.recording.endSec,25.95);
  assert.deepEqual(saved.recording.segments.map(s=>s.id),['20','25']);
  for(const e of saved.evidence) {
    const absolute=saved.recording.startSec+correctionReplayOffset(saved,e.timestampSec);
    assert.equal(absolute,result.window.startSec+e.timestampSec);
    assert.equal(segmentAt(saved.recording.segments,absolute)?.id,e.frameIndex===0?'20':'25');
  }
  assert.equal(saved.evidenceImages?.[1].dataUrl,frames[1].dataUrl);
  assert.equal(saved.result.window.startSec,20,'arrival time is never used as recording origin');
});

test('camera analysis snapshots use only recent frames and end at the last captured moment', t => {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,
    getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,/9j/2Q=='})}});
  t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else Reflect.deleteProperty(globalThis,'document');});
  const frames=new CameraFrames(),video={readyState:2,videoWidth:1280,videoHeight:720} as HTMLVideoElement;
  for(let i=0;i<=30;i++)frames.capture(video,i*0.4);
  frames.capture(video,12); // duplicate presentation must not duplicate an evidence time
  const window=frames.snapshot('s',12.3);
  assert.ok(window.startSec>=9.3);
  assert.equal(window.request.frames.length,4);
  assert.ok(window.request.durationSec>=2.4-1e-9,'fewer images still span the recent movement, not just its final instant');
  assert.equal(window.startSec+window.request.durationSec,12);
  assert.ok(LiveInspectionRequestSchema.safeParse({window}).success);
  frames.clear();assert.throws(()=>frames.snapshot('s',13),/gathering movement/);
});

test('earlier positive evidence cannot overwrite a newer mistake; fresh improvement can reassure',()=>{
  const latest=findings();latest.window.startSec=25;
  const list=mergeFindings([],latest);
  const earlier=findings('looks_consistent');
  assert.deepEqual(mergeFindings(list,earlier),list);
  const later=findings('looks_consistent');later.window.startSec=29;
  const improved=mergeFindings(list,later);
  assert.equal(improved[0].status,'improved');
  assert.equal(createCuePolicy().select(improved,32,false)?.status,'improved');
  assert.equal(createCuePolicy().select(improved,44,false),undefined,'stale improvement is not reassurance');
});

test('recording origin uses the start event time even when event delivery is delayed', async t => {
  let now=2, recorder!:Recorder;
  class Stream { constructor(_tracks:unknown[]) {} }
  class Recorder {
    static isTypeSupported(){return true;}
    state='inactive';mimeType='video/mp4';onstart?:(event:{timeStamp:number})=>void;
    ondataavailable?:(event:{data:Blob})=>void;onstop?:()=>void;
    constructor(){recorder=this;}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['test segment'])});this.onstop?.();}
  }
  const globals={MediaStream:Stream,MediaRecorder:Recorder,document:{createElement:()=>({canPlayType:()=> 'probably'})}};
  for(const [key,value] of Object.entries(globals)) {
    const old=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true});
    t.after(()=>{if(old)Object.defineProperty(globalThis,key,old);else Reflect.deleteProperty(globalThis,key);});
  }
  t.mock.method(performance,'now',()=>now*1000);
  const recording=new RollingRecording({getVideoTracks:()=>[]} as unknown as MediaStream,()=>now,()=>assert.fail());
  recording.start();
  now=2.8;recorder.onstart?.({timeStamp:2200}); // started at 2.2s, delivered at 2.8s
  const pinned=recording.pin('window',2,3);
  assert.ok(Math.abs(pinned.segments[0].startSec-2.2)<1e-7);
  now=3;recording.retainRepThrough(2.9);
  const recent=await recording.stop();
  assert.ok(Math.abs(recent.startSec-2.2)<1e-7,'a short rep clip starts at real recording availability, after permission/startup delay');
  assert.equal(recent.endSec,2.9);
  assert.ok(pinned.segments[0].blob);
});

test('fresh positive checks can reassure from the first report without claiming all form is good',()=>{
  const list=mergeFindings([],findings('looks_consistent'));
  assert.equal(list.length,1);
  assert.equal(list[0].criterionId,'neutral_wrist');
  assert.equal(list[0].status,'consistent');
  const policy=createCuePolicy();
  const cue=policy.select(list,23,false)!;
  assert.ok(cue);policy.spoken(cue,23);
  assert.equal(policy.select(list,27,false),undefined,'wait for the reassurance cooldown');
  assert.equal(createCuePolicy().select(list,35,false),undefined,'old praise is not fresh reassurance');
  const unclear=mergeFindings([],findings('unclear'));
  assert.equal(policy.select(unclear,40,false),undefined);
});

test('new corrections take priority while reminders leave room for specific reassurance',()=>{
  const warning=mergeFindings([],findings())[0];
  const positive={...warning,criterionId:'steady_torso' as const,status:'consistent' as const};
  const policy=createCuePolicy();
  const cue=policy.select([positive,warning],23,false)!;
  assert.equal(cue.status,'needs_attention');policy.spoken(cue,23);
  assert.equal(policy.select([{...positive,windowId:'fresh-positive',observedThroughSec:26},warning],27,false)?.kind,'reassurance');
  assert.ok(createCuePolicy().select([warning],30,false),'a delayed but useful correction can still coach the next rep');
  assert.equal(createCuePolicy().select([warning],43,false),undefined,'very old corrections stay in review');
});


test('coaching continues with praise, actionable reminders, and acknowledgment of improvement',()=>{
  const policy=createCuePolicy();
  const warning=mergeFindings([],findings())[0];
  const positive={...warning,criterionId:'steady_torso' as const,status:'consistent' as const,note:'Your torso stayed steady.'};
  const first=policy.select([warning,positive],23,false)!;
  assert.equal(first.kind,'correction');policy.spoken(first,23);
  // Even when playback takes six seconds, praise and reminders both get a turn.
  const praise=policy.select([warning,positive],29,false)!;
  assert.equal(praise.kind,'reassurance');policy.spoken(praise,29);
  assert.match(coachingCueText(praise),/what was good/);
  const nudge=policy.select([warning,{...positive,observedThroughSec:34}],35,false)!;
  assert.equal(nudge.kind,'nudge');policy.spoken(nudge,35);
  assert.match(coachingCueText(nudge),/Next-rep reminder, not a new observation/);
  const improved={...warning,status:'improved' as const,observedThroughSec:36,note:'Your wrists stayed aligned.'};
  const recovered=policy.select([improved],38,false)!;
  assert.equal(recovered.kind,'reassurance');assert.equal(recovered.status,'improved');
  policy.spoken(recovered,38);
  assert.equal(policy.select([{...improved,observedThroughSec:42}],44,false)?.kind,'reassurance','keep acknowledging supported good form throughout the set');
  assert.equal(policy.select([warning],43,false),undefined,'stop nudging after evidence expires');
});
