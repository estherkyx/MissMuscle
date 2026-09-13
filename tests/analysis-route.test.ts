import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server';

const input = {
  clipId: 'uploaded-clip', exerciseId: 'dumbbell_curl', durationSec: 5,
  frames: [0, 2.35].map(timestampSec => ({ timestampSec, dataUrl: 'data:image/jpeg;base64,/9j/2Q==', width: 1, height: 1 })),
};
const findings = () => ({
  summary: 'The upper arm shifts forward across the sampled frames.',
  visibility: { assessable: true, limitations: [] }, targetMuscles: ['Biceps brachii'],
  nextAttemptFocus: 'Keep the upper arm steadier.',
  corrections: [{ title: 'Upper arm movement', priority: 'focus_first', observation: 'The upper arm shifts forward.', cue: 'Keep your upper arm near your side.', referenceCue: 'Aim for a steady upper arm.', evidence: [{ frameIndex: 1, region: null as unknown }] }],
});
const envelope = (value: unknown) => ({ status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
const analyze = (clipId = input.clipId) => worker.fetch(new Request('http://localhost/api/analyze', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, clipId }),
}), { OPENAI_API_KEY: 'test-key' });

test('analysis sends ordered images to Astra and binds real results to each request', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body as string);
    assert.equal(body.model, 'gpt-6-astra');
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.deepEqual(body.input[0].content.filter((part: { type: string }) => part.type === 'input_image').map((part: { image_url: string }) => part.image_url), input.frames.map(frame => frame.dataUrl));
    assert.match(body.input[0].content[3].text, /Frame 1; timestamp 2.35/);
    return Response.json(envelope(findings()));
  });
  for (const clipId of ['first', 'second']) {
    const response = await analyze(clipId);
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.equal(report.clipId, clipId);
    assert.equal(report.source, 'astra');
    assert.equal(report.corrections[0].evidence[0].timestampSec, 2.35);
  }
});

test('unassessable clips can return limitations without findings', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(envelope({ ...findings(), visibility: { assessable: false, limitations: ['Arms are hidden.'] }, corrections: [] })));
  assert.equal((await analyze()).status, 200);
});

test('invalid provider findings never become a report', async t => {
  const unknownFrame = findings(); unknownFrame.corrections[0].evidence[0].frameIndex = 9;
  const badRegion = findings(); badRegion.corrections[0].evidence[0].region = { x: 0.9, y: 0, width: 0.5, height: 0.5 };
  for (const value of [unknownFrame, badRegion, {}, { ...findings(), visibility: { assessable: false, limitations: [] } }]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => Response.json(envelope(value)));
    const response = await analyze();
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.code, 'INVALID_MODEL_OUTPUT');
    mock.mock.restore();
  }
});

test('provider errors are actionable and do not expose provider bodies', async t => {
  for (const [upstream, status, code] of [[401, 503, 'OPENAI_AUTH_FAILED'], [403, 503, 'OPENAI_ACCESS_DENIED'], [404, 503, 'OPENAI_ACCESS_DENIED'], [429, 429, 'OPENAI_RATE_LIMIT'], [400, 502, 'OPENAI_REQUEST_REJECTED'], [500, 502, 'OPENAI_UPSTREAM_ERROR']] as const) {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response('sensitive upstream details', { status: upstream }));
    const response = await analyze();
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert.doesNotMatch(JSON.stringify(body), /sensitive/);
    mock.mock.restore();
  }
});

test('incomplete, refused and malformed responses fail explicitly', async t => {
  for (const [payload, code] of [
    [{ ...envelope(findings()), status: 'incomplete' }, 'ANALYSIS_INCOMPLETE'],
    [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }, 'ANALYSIS_REFUSED'],
    ['not json', 'OPENAI_INVALID_RESPONSE'],
  ] as const) {
    const mock = t.mock.method(globalThis, 'fetch', async () => typeof payload === 'string' ? new Response(payload) : Response.json(payload));
    assert.equal((await (await analyze()).json()).error.code, code);
    mock.mock.restore();
  }
});

test('network failures do not fall back to a fixture', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('fetch failed'); });
  assert.equal((await (await analyze()).json()).error.code, 'OPENAI_UNREACHABLE');
});

test('timeout aborts the actual upstream request', async t => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, 'timeout', () => controller.signal);
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    controller.abort(new DOMException('Timed out', 'TimeoutError'));
  }));
  assert.equal((await (await analyze()).json()).error.code, 'OPENAI_TIMEOUT');
});

test('health distinguishes configuration from model access verification', async () => {
  for (const [env, expected] of [[{}, 'missing_api_key'], [{ OPENAI_API_KEY: 'test' }, 'configured']] as const) {
    const response = await worker.fetch(new Request('http://localhost/api/health'), env);
    assert.equal((await response.json()).analysis, expected);
  }
});
