import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequestError, inspectLiveWindow } from '../src/lib/api';
import { LIVE_TIMING } from '../shared/live-timing';

const input = { window: { sessionId: 'session', windowId: 'clip', startSec: 0, request: {
  clipId: 'clip', exerciseId: 'dumbbell_curl' as const, durationSec: 1,
  frames: [0, 1].map(timestampSec => ({ timestampSec, dataUrl: 'data:image/jpeg;base64,/9j/2Q==', width: 1, height: 1 })),
} } };

test('live analysis distinguishes timeouts from rate/quota and other provider failures', async t => {
  for (const [status, code, message] of [
    [504, 'OPENAI_TIMEOUT', 'OpenAI took too long to respond. Please try again.'],
    [429, 'OPENAI_RATE_LIMIT', 'The OpenAI project hit a rate or quota limit.'],
    [502, 'OPENAI_UNREACHABLE', 'Could not reach OpenAI.'],
  ] as const) {
    const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code, message } }, { status }));
    await assert.rejects(inspectLiveWindow(input, new AbortController().signal), error => {
      assert.ok(error instanceof ApiRequestError);
      assert.equal(error.code, code);
      if (code === 'OPENAI_TIMEOUT') assert.match(error.message, /Checking fresh movement automatically/);
      else assert.equal(error.message, message);
      return true;
    });
    assert.equal(mock.mock.callCount(), 1, 'failed footage is not automatically resubmitted');
    mock.mock.restore();
  }
});

test('browser deadline includes transport grace and explains automatic recovery', async t => {
  const deadline = new AbortController();
  const durations: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { durations.push(ms); return deadline.signal; });
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    deadline.abort(new DOMException('Timed out', 'TimeoutError'));
  }));
  await assert.rejects(inspectLiveWindow(input, new AbortController().signal), error => {
    assert.ok(error instanceof ApiRequestError);
    assert.equal(error.code, 'OPENAI_TIMEOUT');
    return true;
  });
  assert.equal(durations[0], LIVE_TIMING.analysisTimeoutMs + LIVE_TIMING.analysisTransportGraceMs);
  assert.ok(durations[0] > LIVE_TIMING.analysisTimeoutMs);
});

test('ending the session is cancellation, not a timeout or an automatic retry', async t => {
  const controller = new AbortController();
  const cancelled = new DOMException('Session ended', 'AbortError');
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    controller.abort(cancelled);
  }));
  await assert.rejects(inspectLiveWindow(input, controller.signal), error => error === cancelled);
});
