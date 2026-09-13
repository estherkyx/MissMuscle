import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveSession } from '../server/live/create-session';

test('automatic voice preserves GPT-Live and disables conversational tools', async t => {
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string);
    assert.equal(body.session.model, 'gpt-live-1');
    assert.equal(body.session.delegation.responses.model, 'gpt-6-astra');
    assert.deepEqual(body.session.delegation.responses.tools, []);
    assert.match(body.session.instructions, /no microphone input and no conversation/);
    assert.match(body.session.instructions, /Speak each application-provided coaching update immediately/);
    return Response.json({ session: { id: 'provider-session' }, transport: { type: 'webrtc', sdp: 'test-sdp-answer' } });
  });
  await createLiveSession({ sdpOffer: 'test-sdp-offer', context: { mode: 'live', guidanceOnly: true, sessionId: 'exercise-session', exerciseId: 'dumbbell_curl', elapsedSec: 0, latest: null } }, { OPENAI_API_KEY: 'test-only-key' });
});
