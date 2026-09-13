import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server';
import { EXERCISES } from '../shared/exercises';
import { AnalysisReportSchema, AnalysisRequestSchema, CoachContextSchema, validateReportForRequest } from '../shared/contracts';
import { buildCoachInstructions } from '../shared/coach-config';
import { validatePlaybackCommand } from '../src/features/video/playback';

const checks = (exercise: typeof EXERCISES[number]) => exercise.criteria.map(criterion => ({ criterionId: criterion.id, status: 'unclear', note: 'Synthetic visibility limitation.', evidence: [] }));
const frames = [0, 2].map(timestampSec => ({ timestampSec, width: 1, height: 1, dataUrl: 'data:image/jpeg;base64,/9j/2Q==' }));
const post = (path: string, body: unknown) => new Request('http://localhost'+path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('all exercise routes select their own criteria, muscles, evidence and voice context', async t => {
  for (const exercise of EXERCISES) {
    const request = AnalysisRequestSchema.parse({ clipId: exercise.id, exerciseId: exercise.id, durationSec: 3, frames });
    const mock = t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      assert.ok(body.instructions.includes(exercise.version));
      assert.ok(body.instructions.includes(exercise.criteria[0].deviation));
      assert.ok(body.input[0].content[0].text.includes(exercise.variation));
      assert.equal(body.model, 'gpt-6-astra');
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
        summary: 'Synthetic provider response for routing tests.', formChecks: checks(exercise), visibility: { assessable: true, limitations: [] },
        corrections: [{ title: exercise.criteria[0].title, priority: 'focus_first', observation: 'Synthetic observation across frames.', cue: exercise.criteria[0].cue, referenceCue: exercise.criteria[0].expected, evidence: [{ frameIndex: 0, region: null }, { frameIndex: 1, region: null }] }], nextAttemptFocus: exercise.criteria[0].cue,
      }) }] }] });
    });
    const response = await worker.fetch(post('/api/analyze', request), { OPENAI_API_KEY: 'test' });
    assert.equal(response.status, 200);
    const report = AnalysisReportSchema.parse(await response.json());
    assert.equal(report.exerciseId, exercise.id);
    assert.deepEqual(report.targetMuscles, exercise.targetMuscles);
    assert.deepEqual(report.formChecks?.map(check => check.criterionId), exercise.criteria.map(criterion => criterion.id));
    assert.equal(AnalysisReportSchema.safeParse({ ...report, formChecks: checks(EXERCISES.find(other => other.id !== exercise.id)!) }).success, false);
    assert.deepEqual(report.corrections[0].evidence.map(e => e.timestampSec), [0, 2]);
    validateReportForRequest(report, request);
    assert.throws(() => validateReportForRequest(report, { ...request, exerciseId: EXERCISES.find(e => e.id !== exercise.id)!.id }));
    const context = CoachContextSchema.parse({ report, currentTimeSec: 1, selectedCorrectionId: report.corrections[0].id });
    assert.ok(buildCoachInstructions(context).includes(exercise.id));
    assert.doesNotThrow(() => validatePlaybackCommand({ type: 'show_correction', correctionId: report.corrections[0].id }, 3, report));
    mock.mock.restore();
    const voice = t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      assert.ok(body.session.delegation.responses.instructions.includes(exercise.id));
      assert.equal(body.session.model, 'gpt-live-1');
      return Response.json({ session: { id: 'test-session' }, transport: { type: 'webrtc', sdp: 'answer' } });
    });
    assert.equal((await worker.fetch(post('/api/live/session', { sdpOffer: 'offer', context }), { OPENAI_API_KEY: 'test' })).status, 200);
    voice.mock.restore();
  }
});

test('unknown exercises never reach a provider; mismatched footage can return a limitation', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ summary: 'The selected variation is not visible.', formChecks: checks(EXERCISES.find(exercise => JSON.parse(init.body as string).instructions.includes(exercise.version))!), visibility: { assessable: false, limitations: ['Select the exercise shown in the recording.'] }, corrections: [], nextAttemptFocus: 'Check your exercise selection.' }) }] }] }));
  assert.equal((await worker.fetch(post('/api/analyze', { clipId: 'test', exerciseId: 'unknown', durationSec: 3, frames }), { OPENAI_API_KEY: 'test' })).status, 400);
  assert.equal(mock.mock.callCount(), 0);
  for (const exercise of EXERCISES) {
    const response = await worker.fetch(post('/api/analyze', { clipId: 'test', exerciseId: exercise.id, durationSec: 3, frames }), { OPENAI_API_KEY: 'test' });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).corrections, []);
  }
});
