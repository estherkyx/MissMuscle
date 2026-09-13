import { coachingCueText, reviewSpeech } from '../src/features/live/coaching-cue';
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormChecklist } from '../src/features/review/FormChecklist';
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

// Synthetic provider responses test the shared contract and rendering, not visual detection.
test('pulldown hand comparisons reach the checklist with evidence and preserve uncertainty', async t => {
  const exercise = EXERCISES.find(item => item.id === 'lat_pulldown')!;
  for (const status of ['needs_attention', 'looks_consistent', 'unclear'] as const) {
    const note = status === 'needs_attention' ? 'One hand grips farther from the bar center in both reviewed moments.' : status === 'unclear' ? 'One hand is hidden, so grip symmetry cannot be assessed.' : 'Both hands stay evenly placed about the bar center.';
    const draft = {
      summary: 'Synthetic pulldown grip assessment.', visibility: { assessable: true, limitations: status === 'unclear' ? [note] : [] },
      formChecks: checks(exercise).map(check => check.criterionId === 'even_grip_pull' ? { ...check, status, note, evidence: status === 'unclear' ? [] : [{ frameIndex: 0 }, { frameIndex: 1 }] } : check),
      corrections: status === 'needs_attention' ? [{ title: 'Match your hand positions', priority: 'focus_first', observation: note, cue: 'Place your hands evenly about the bar center.', referenceCue: 'Use an even grip.', evidence: [{ frameIndex: 0, region: null }, { frameIndex: 1, region: null }] }] : [],
      nextAttemptFocus: status === 'needs_attention' ? 'Match your hand positions on the bar.' : note,
    };
    const mock = t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      assert.match(body.instructions, /Explicitly inspect even_grip_pull/);
      assert.match(body.instructions, /unequal screen heights or apparent distances alone are insufficient/);
      assert.match(body.instructions, /mark this check unclear/);
      assert.match(body.instructions, /lat_pulldown-2/);
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }] });
    });
    const response = await worker.fetch(post('/api/analyze', { clipId: 'grip-test', exerciseId: exercise.id, durationSec: 3, frames }), { OPENAI_API_KEY: 'test' });
    assert.equal(response.status, 200);
    const report = AnalysisReportSchema.parse(await response.json());
    assert.equal(report.formChecks?.length, 4);
    const check = report.formChecks!.find(item => item.criterionId === 'even_grip_pull')!;
    assert.equal(check.status, status);
    assert.deepEqual(check.evidence.map(item => item.timestampSec), status === 'unclear' ? [] : [0, 2]);
    assert.equal(report.corrections.length, status === 'needs_attention' ? 1 : 0);
    const html = renderToStaticMarkup(createElement(FormChecklist, { report, onSeek: () => {} }));
    assert.match(html, /Even grip and pull/);
    assert.ok(html.includes(note));
    if (status !== 'unclear') {
      assert.match(html, /Jump to 2s/);
      const insufficient = structuredClone(report);
      insufficient.formChecks!.find(item => item.criterionId === 'even_grip_pull')!.evidence.pop();
      assert.equal(AnalysisReportSchema.safeParse(insufficient).success, false);
    } else {
      assert.doesNotMatch(html, /Looks consistent|Needs attention|Jump to/);
    }
    mock.mock.restore();
  }
});

test('leg extension completion is distinct from smoothness and requires endpoint evidence', async t => {
  const exercise = EXERCISES.find(item => item.id === 'leg_extension')!;
  const legFrames = [0, 1, 2].map(timestampSec => ({ ...frames[0], timestampSec }));
  for (const status of ['needs_attention', 'looks_consistent', 'unclear'] as const) {
    const note = status === 'needs_attention' ? 'Your knees remain bent at the top before you lower again.' : status === 'looks_consistent' ? 'Your legs straighten at the visible top of the rep.' : 'The top of the repetition is not visible.';
    const evidence = status === 'unclear' ? [] : [{ frameIndex: 0 }, { frameIndex: 1 }, { frameIndex: 2 }];
    const draft = {
      summary: 'Synthetic leg-extension completion assessment.', visibility: { assessable: true, limitations: status === 'unclear' ? [note] : [] },
      formChecks: checks(exercise).map(check => check.criterionId === 'full_extension' ? { ...check, status, note, evidence } : check.criterionId === 'smooth_extension' ? { ...check, status: 'looks_consistent', note: 'Movement is smooth in this synthetic response.', evidence: [{ frameIndex: 0 }, { frameIndex: 2 }] } : check),
      corrections: status === 'needs_attention' ? [{ title: 'Finish the extension', priority: 'focus_first', observation: note, cue: 'Straighten your legs fully under control before lowering.', referenceCue: 'Reach a straight knee position without forcing past it.', evidence: evidence.map(item => ({ ...item, region: null })) }] : [],
      nextAttemptFocus: status === 'needs_attention' ? 'Finish straightening before lowering.' : note,
    };
    const mock = t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      assert.match(body.instructions, /leg_extension-4/);
      assert.match(body.instructions, /Explicitly inspect full_extension separately from smooth_extension/);
      assert.match(body.instructions, /at least three ordered supplied moments/);
      assert.match(body.instructions, /Do not call a mid-repetition bent knee incomplete extension/);
      assert.match(body.instructions, /mark full_extension unclear/);
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }] });
    });
    const response = await worker.fetch(post('/api/analyze', { clipId: 'extension-test', exerciseId: exercise.id, durationSec: 3, frames: legFrames }), { OPENAI_API_KEY: 'test' });
    assert.equal(response.status, 200);
    const report = AnalysisReportSchema.parse(await response.json());
    assert.equal(report.formChecks?.length, 4);
    assert.equal(report.formChecks?.find(check => check.criterionId === 'full_extension')?.status, status);
    assert.equal(report.formChecks?.find(check => check.criterionId === 'smooth_extension')?.status, 'looks_consistent');
    assert.equal(report.corrections.length, status === 'needs_attention' ? 1 : 0);
    const html = renderToStaticMarkup(createElement(FormChecklist, { report, onSeek: () => {} }));
    assert.match(html, /Full extension/);
    assert.ok(html.includes(note));
    if (status === 'needs_attention') {
      assert.deepEqual(report.corrections[0].evidence.map(item => item.timestampSec), [0, 1, 2]);
    }
    if (status !== 'unclear') {
      const incomplete = structuredClone(report);
      incomplete.formChecks!.find(check => check.criterionId === 'full_extension')!.evidence.pop();
      assert.equal(AnalysisReportSchema.safeParse(incomplete).success, false);
      draft.formChecks.find(check => check.criterionId === 'full_extension')!.evidence.pop();
      const invalid = await worker.fetch(post('/api/analyze', { clipId: 'extension-test', exerciseId: exercise.id, durationSec: 3, frames: legFrames }), { OPENAI_API_KEY: 'test' });
      assert.equal(invalid.status, 502);
      assert.equal((await invalid.json()).error.code, 'INVALID_MODEL_OUTPUT');
    }
    mock.mock.restore();
  }
});

// These synthetic reports verify wiring and evidence requirements, not recognition of real squat depth.
test('squat depth flags a supported short rep independently of other form checks', async t => {
  const exercise = EXERCISES.find(item => item.id === 'dumbbell_front_squat')!;
  const squatFrames = [0, 1, 2].map(timestampSec => ({ ...frames[0], timestampSec }));
  for (const status of ['needs_attention', 'looks_consistent', 'unclear'] as const) {
    const note = status === 'needs_attention' ? 'You start standing back up while your thighs are still well above parallel.' : status === 'looks_consistent' ? 'Your thighs reach approximately parallel at the bottom.' : 'The bottom and turnaround are not visible.';
    const evidence = status === 'unclear' ? [] : [0, 1, 2].map(frameIndex => ({ frameIndex }));
    const draft = {
      summary: 'Synthetic squat-depth response.', visibility: { assessable: true, limitations: status === 'unclear' ? [note] : [] },
      formChecks: checks(exercise).map(check => check.criterionId === 'squat_depth' ? { ...check, status, note, evidence } : check.criterionId === 'grounded_feet' ? { ...check, status: 'looks_consistent', note: 'Your heels stay down.', evidence: [{ frameIndex: 0 }, { frameIndex: 2 }] } : check),
      corrections: status === 'needs_attention' ? [{ title: 'Complete the squat range', priority: 'focus_first', observation: note, cue: 'Work toward reference depth while staying controlled.', referenceCue: 'The full-rep reference reaches thighs approximately parallel.', evidence: evidence.map(item => ({ ...item, region: null })) }] : [],
      nextAttemptFocus: note,
    };
    const mock = t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      assert.match(body.instructions, /dumbbell_front_squat-4/);
      assert.match(body.instructions, /Explicitly inspect squat_depth independently/);
      assert.match(body.instructions, /Do not call a mid-descent frame a half rep/);
      assert.match(body.instructions, /Do not claim a measured 90-degree knee angle/);
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }] });
    });
    const request = { clipId: 'squat-depth-test', exerciseId: exercise.id, durationSec: 3, frames: squatFrames };
    const response = await worker.fetch(post('/api/analyze', request), { OPENAI_API_KEY: 'test' });
    assert.equal(response.status, 200);
    const report = AnalysisReportSchema.parse(await response.json());
    assert.equal(report.formChecks?.length, 5);
    assert.equal(report.formChecks?.find(check => check.criterionId === 'squat_depth')?.status, status);
    assert.equal(report.formChecks?.find(check => check.criterionId === 'grounded_feet')?.status, 'looks_consistent');
    const review={window:{sessionId:'test',windowId:'depth',startSec:0},report,answer:report.summary};
    const reassurance=coachingCueText({criterionId:'grounded_feet',kind:'reassurance',status:'consistent',
      note:'Your heels stay down.',windowId:'depth',observedThroughSec:2},exercise.id,review);
    if(status==='unclear') {
      assert.match(reassurance,/squat depth was not confirmed/);
      assert.match(reviewSpeech(review),/squat depth was not confirmed/);
    } else if(status==='needs_attention') {
      assert.ok(reassurance.includes(note),'praise for feet must retain the known depth correction');
    } else assert.doesNotMatch(reassurance,/not confirmed|depth correction/);
    assert.equal(report.corrections.length, status === 'needs_attention' ? 1 : 0);
    const html = renderToStaticMarkup(createElement(FormChecklist, { report, onSeek: () => {} }));
    assert.match(html, /Squat depth/);
    assert.ok(html.includes(note));
    if (status === 'needs_attention') {
      assert.deepEqual(report.corrections[0].evidence.map(item => item.timestampSec), [0, 1, 2]);
    }
    if (status !== 'unclear') {
      draft.formChecks.find(check => check.criterionId === 'squat_depth')!.evidence.pop();
      const invalid = await worker.fetch(post('/api/analyze', request), { OPENAI_API_KEY: 'test' });
      assert.equal(invalid.status, 502);
    }
    mock.mock.restore();
  }
});
