import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveExerciseSession } from '../src/features/live/session';
import { referenceSpatialPose, projectReferencePoint } from '../src/features/video/reference-spatial';
import { EXERCISES } from '../shared/exercises';
import { FormCriterionIdSchema } from '../shared/contracts';
import { demoReport } from '../shared/fixtures/demo-report';
import type { LiveInspectionRequest, LiveInspectionResult } from '../shared/contracts';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

for (const exercise of EXERCISES) for (const assessable of [true, false]) test(`${exercise.id}: a slow completed ${assessable ? 'correction' : 'unclear assessment'} is displayed and can be spoken`, async t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now * 1000);
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const track = { onended: null, stop() {} };
  class Stream {
    getVideoTracks() { return [track]; }
    getTracks() { return [track]; }
  }
  class Recorder {
    static isTypeSupported() { return true; }
    state = 'inactive'; mimeType = 'video/mp4';
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['test video']) }); this.onstop?.(); }
  }
  const globals = {
    window: { isSecureContext: true, MediaRecorder: Recorder }, MediaStream: Stream, MediaRecorder: Recorder,
    navigator: { mediaDevices: { getUserMedia: async () => new Stream() } },
    document: { createElement: () => ({ width: 0, height: 0, canPlayType: () => 'probably',
      getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,/9j/2Q==' }) },
  };
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); });
  }
  let input!: LiveInspectionRequest, finish!: (result: LiveInspectionResult) => void;
  let requests = 0, assessment: LiveInspectionResult | undefined, findingCount = 0;
  const spoken: string[] = [];
  const video = { readyState: 2, videoWidth: 640, videoHeight: 480, srcObject: null, async play() {}, pause() {} } as unknown as HTMLVideoElement;
  const session = new LiveExerciseSession(video, {
    onReady() {}, onError() {}, onStatus() {}, onTranscript() {}, onMetrics() {}, onAnalyzing() {},
    onFindings: findings => { findingCount = findings.length; }, onAssessment: result => { assessment = result; },
  }, exercise.id, {
    inspect: request => { input = request; requests++; return new Promise(resolve => { finish = resolve; }); },
    connect: async options => {
      assert.equal(options.context.exerciseId,exercise.id);
      return ({
      updateContext() {}, setMuted() {}, async disconnect() {},
      announceCue(text) { spoken.push(text); options.onCueStarted?.(); return true; },
    }); },
  });
  await session.start();
  for (let step = 0; step < 100; step++) {
    now += 0.25;
    if (exercise.id==='dumbbell_front_squat' && assessable && now>=16 && now<=24) {
      const phase=(now-16)/4,progress=(phase<=1?phase:2-phase)*0.35;
      const pose=referenceSpatialPose(exercise.id,progress).map(point=>projectReferencePoint(point,0));
      session.observePose([pose],300,400,now*1000);
    }
    t.mock.timers.tick(250);
  }
  assert.equal(requests, 1, 'slow requests are allowed to finish without overlapping retries');
  assert.equal(assessment, undefined);
  assert.equal(spoken.length, 1, 'a real introduction is requested before any findings exist');
  const request = input.window.request;
  assert.equal(request.exerciseId,exercise.id);
  assert.ok(spoken[0].includes(exercise.label.toLowerCase()));
  const result: LiveInspectionResult = {
    window: { sessionId: input.window.sessionId, windowId: input.window.windowId, startSec: input.window.startSec },
    answer: assessable ? 'Your wrist bent in the reviewed rep.' : 'Your wrist position could not be assessed.',
    report: { ...demoReport, exerciseId: exercise.id, targetMuscles:exercise.targetMuscles, id: 'test-report', source: 'astra', clipId: request.clipId, durationSec: request.durationSec,
      summary: assessable ? 'Your wrist bent in the reviewed rep.' : 'Your wrist position could not be assessed.',
      visibility: { assessable, limitations: assessable ? [] : ['The wrist was obscured.'] }, corrections: [],
      formChecks: exercise.criteria.map((criterion,index) => ({
        criterionId:FormCriterionIdSchema.parse(criterion.id),
        status: assessable && index===0 ? 'needs_attention' : 'unclear',
        note: assessable ? criterion.cue : 'The relevant movement was obscured.',
        evidence: assessable && index===0 ? request.frames.slice(0,2).map((frame,frameIndex)=>({frameIndex,timestampSec:frame.timestampSec})) : [],
      })),
    },
  };
  finish(result); await flush();
  assert.equal(assessment, result, 'completed results are not silently discarded after fifteen seconds');
  assert.equal(findingCount, assessable ? 1 : 0);
  assert.match(spoken.at(-1)!, assessable ? /Delayed review of an earlier rep, not the current pose/ : /Assessment limitation, not good-form feedback/);
  const count = spoken.length;
  now += 0.25; t.mock.timers.tick(250);
  assert.equal(spoken.length, count, 'the same completed review is not announced every tick');
  if (exercise.id==='dumbbell_front_squat' && assessable) {
    assert.equal(requests,2);
    const evidenceTimes=input.window.request.frames.map(frame=>input.window.startSec+frame.timestampSec);
    assert.ok(input.window.startSec<19,'the next available request preserves the squat descent');
    assert.ok(evidenceTimes.some(time=>Math.abs(time-20)<=0.3),'the actual frontal shallow-squat turnaround is submitted');
    assert.ok(evidenceTimes.at(-1)!>20.5,'return evidence accompanies the turnaround');
    assert.ok(evidenceTimes.length<=4);
  }
  await session.stop();
});
