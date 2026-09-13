import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeClip } from '../server/analysis/analyze';
import { createLiveSession } from '../server/live/create-session';
import { demoReport } from '../shared/fixtures/demo-report';
import { AnalysisRequestSchema, FormCriterionIdSchema } from '../shared/contracts';
import { ServiceError } from '../server/errors';

// Byte-boundary-only fixture. Unit tests mock the provider; real image decoding
// is checked by scripts/smoke-analysis.ts using a real JPEG supplied by the caller.
const request = AnalysisRequestSchema.parse({
  clipId: 'clip-a', exerciseId: 'dumbbell_curl', durationSec: 10,
  frames: [0, 3, 7].map(timestampSec => ({ timestampSec, dataUrl: 'data:image/jpeg;base64,/9j/2Q==', width: 1, height: 1 })),
});
const draft = {
  summary: 'Visible upper-arm movement during this repetition.',
  visibility: { assessable: true, limitations: [] },
  formChecks: FormCriterionIdSchema.options.map(criterionId => ({ criterionId, status: 'unclear', note: 'This cue is not clear enough to assess.', evidence: [] as Array<{ frameIndex: number }> })),
  corrections: [{
    title: 'Keep the upper arm steadier', priority: 'focus_first',
    observation: 'The upper arm moves forward between these frames.',
    cue: 'Try keeping your upper arm more still.', referenceCue: 'Use a controlled elbow bend.',
    evidence: [{ frameIndex: 0, region: null }, { frameIndex: 2, region: null }],
  }],
  nextAttemptFocus: 'Focus on this one cue.',
};
const envelope = (value: unknown) => ({ status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
const serviceCode = (code: string) => (error: unknown) => error instanceof ServiceError && error.code === code;

test('Astra uses ordered images, strict structured output, and server-owned timestamps', async t => {
  let payload: Record<string, unknown> = {};
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    payload = JSON.parse(init.body as string);
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer test-key');
    return Response.json(envelope(draft));
  });
  const report = await analyzeClip(request, { OPENAI_API_KEY: 'test-key' });
  assert.equal(payload.model, 'gpt-6-astra');
  assert.equal(payload.store, false);
  const input = payload.input as Array<{ content: Array<{ type: string; image_url?: string; text?: string }> }>;
  assert.deepEqual(input[0].content.filter(c => c.type === 'input_image').map(c => c.image_url), request.frames.map(f => f.dataUrl));
  assert.equal(report.source, 'astra');
  assert.equal(report.clipId, 'clip-a');
  assert.deepEqual(report.corrections[0].evidence.map(e => e.timestampSec), [0, 7]);
  assert.equal(report.corrections[0].id, 'correction-1');
  assert.equal(report.formChecks?.length, 5);
});
test('Astra refuses invented frames and unassessable reports containing corrections', async t => {
  const invalid = structuredClone(draft); invalid.corrections[0].evidence[0].frameIndex = 12;
  const mocked = t.mock.method(globalThis, 'fetch', async () => Response.json(envelope(invalid)));
  await assert.rejects(analyzeClip(request, { OPENAI_API_KEY: 'test' }), serviceCode('INVALID_MODEL_OUTPUT'));
  mocked.mock.mockImplementation(async () => Response.json(envelope({ ...draft, visibility: { assessable: false, limitations: ['Occluded'] } })));
  await assert.rejects(analyzeClip(request, { OPENAI_API_KEY: 'test' }), serviceCode('INVALID_MODEL_OUTPUT'));
});
test('a legitimate visibility limitation returns zero corrections', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(envelope({ ...draft, visibility: { assessable: false, limitations: ['Working arm is out of frame.'] }, corrections: [] })));
  const report = await analyzeClip(request, { OPENAI_API_KEY: 'test' });
  assert.equal(report.visibility.assessable, false); assert.deepEqual(report.corrections, []);
});
test('checklist evidence is mapped to seconds and unsupported positive results are rejected', async t => {
  const value = structuredClone(draft);
  value.formChecks[0] = { criterionId: 'steady_upper_arm', status: 'needs_attention', note: 'In frames 0 and 2, the upper arm moves forward.', evidence: [{ frameIndex: 0 }, { frameIndex: 2 }] };
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json(envelope(value)));
  const report = await analyzeClip(request, { OPENAI_API_KEY: 'test' });
  assert.deepEqual(report.formChecks?.[0].evidence.map(e => e.timestampSec), [0, 7]);
  assert.equal(report.formChecks?.[0].note, 'At 0s and 7s, the upper arm moves forward.');
  for (const evidence of [[], [{ frameIndex: 0 }], [{ frameIndex: 0 }, { frameIndex: 0 }], [{ frameIndex: 0 }, { frameIndex: 15 }]]) {
    value.formChecks[0].status = 'looks_consistent'; value.formChecks[0].evidence = evidence;
    mock.mock.mockImplementation(async () => Response.json(envelope(value)));
    await assert.rejects(analyzeClip(request, { OPENAI_API_KEY: 'test' }), serviceCode('INVALID_MODEL_OUTPUT'));
  }
});
test('an unassessable clip cannot pass a checklist criterion and criteria cannot be duplicated', async t => {
  const value = structuredClone(draft);
  value.formChecks[1] = { criterionId: 'neutral_wrist', status: 'looks_consistent', note: 'Wrist appears aligned.', evidence: [{ frameIndex: 0 }] };
  value.visibility.assessable = false; value.corrections = [];
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json(envelope(value)));
  await assert.rejects(analyzeClip(request, { OPENAI_API_KEY: 'test' }), serviceCode('INVALID_MODEL_OUTPUT'));
  value.visibility.assessable = true; value.formChecks[0] = value.formChecks[1];
  mock.mock.mockImplementation(async () => Response.json(envelope(value)));
  await assert.rejects(analyzeClip(request, { OPENAI_API_KEY: 'test' }), serviceCode('INVALID_MODEL_OUTPUT'));
});
test('provider refusal and incomplete generation produce explicit errors', async t => {
  const mocked = t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }));
  await assert.rejects(analyzeClip(request, { OPENAI_API_KEY: 'test' }), serviceCode('ANALYSIS_REFUSED'));
  mocked.mock.mockImplementation(async () => Response.json({ status: 'incomplete', output: [] }));
  await assert.rejects(analyzeClip(request, { OPENAI_API_KEY: 'test' }), serviceCode('ANALYSIS_INCOMPLETE'));
});
test('provider HTTP errors are actionable and do not expose raw bodies', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('private upstream error text', { status: 401 }));
  await assert.rejects(analyzeClip(request, { OPENAI_API_KEY: 'test' }), serviceCode('OPENAI_AUTH_FAILED'));
  mock.mock.mockImplementation(async () => new Response('private upstream error text', { status: 429 }));
  await assert.rejects(analyzeClip(request, { OPENAI_API_KEY: 'test' }), serviceCode('OPENAI_RATE_LIMIT'));
  mock.mock.mockImplementation(async () => { throw new DOMException('Timed out', 'TimeoutError'); });
  await assert.rejects(analyzeClip(request, { OPENAI_API_KEY: 'test' }), serviceCode('OPENAI_TIMEOUT'));
});
test('malformed JPEG bytes are rejected before any provider call', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({}));
  await assert.rejects(analyzeClip({ ...request, frames: request.frames.map(f => ({ ...f, dataUrl: 'data:image/jpeg;base64,AAAA' })) }, { OPENAI_API_KEY: 'test' }), serviceCode('INVALID_IMAGE'));
  assert.equal(fetchMock.mock.callCount(), 0);
});
test('GPT-Live handshake uses the Live API with Responses delegation and preserves opaque IDs', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.openai.com/v1/live/sessions');
    const payload = JSON.parse(init.body as string);
    assert.equal(payload.session.model, 'gpt-live-1');
    assert.equal(payload.session.delegation.type, 'responses');
    assert.equal(payload.session.delegation.responses.model, 'gpt-6-astra');
    assert.equal(payload.transport.sdp, 'sdp-offer');
    assert.equal(payload.session.delegation.responses.tools.length, 4);
    assert.match(payload.session.delegation.responses.instructions, /fixture/);
    return Response.json({ session: { id: 'opaque_live_123' }, transport: { type: 'webrtc', sdp: 'sdp-answer' } });
  });
  const session = await createLiveSession({ sdpOffer: 'sdp-offer', context: { report: demoReport, currentTimeSec: 0, selectedCorrectionId: null } }, { OPENAI_API_KEY: 'test' });
  assert.deepEqual(session, { sessionId: 'opaque_live_123', sdpAnswer: 'sdp-answer' });
});
