import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server';
import { AnalysisReportSchema } from '../shared/contracts';
import { demoReport } from '../shared/fixtures/demo-report';

const post = (path: string, body: unknown) => new Request(`http://localhost${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('sample endpoint is explicitly a fixture and is not cached', async () => {
  const response = await worker.fetch(new Request('http://localhost/api/demo-report'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(AnalysisReportSchema.parse(await response.json()).source, 'fixture');
});
test('invalid analysis input fails before calling a provider', async () => {
  const response = await worker.fetch(post('/api/analyze', {}));
  assert.equal(response.status, 400);
  assert.equal((await response.json() as { error: { code: string } }).error.code, 'INVALID_REQUEST');
});
test('missing analysis key gets explicit 503 instead of fabricated findings', async () => {
  const response = await worker.fetch(post('/api/analyze', {
    clipId: 'test', exerciseId: 'dumbbell_curl', durationSec: 5,
    frames: [0, 2].map(timestampSec => ({ timestampSec, dataUrl: 'data:image/jpeg;base64,/9j/AA==', width: 1, height: 1 })),
  }));
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { error: { code: string } }).error.code, 'OPENAI_KEY_MISSING');
});
test('missing voice key does not create a fake session', async () => {
  const response = await worker.fetch(post('/api/live/session', { sdpOffer: 'test-offer', context: { report: demoReport, currentTimeSec: 0, selectedCorrectionId: null } }));
  assert.equal(response.status, 503);
});
test('unknown API routes stay JSON errors instead of falling through to SPA', async () => {
  const response = await worker.fetch(new Request('http://localhost/api/missing'), { ASSETS: { fetch: async () => new Response('<html>app</html>') } });
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
});
test('non-API requests can be served by the production asset binding', async () => {
  const response = await worker.fetch(new Request('http://localhost/'), { ASSETS: { fetch: async () => new Response('app') } });
  assert.equal(await response.text(), 'app');
});
