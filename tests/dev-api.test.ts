import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { apiMiddleware } from '../scripts/dev-api';

test('ending a browser request cancels provider work through the local API adapter', async () => {
  const req = {
    url: '/api/live/analyze', method: 'POST', headers: { 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() { yield Buffer.from('{}'); },
  } as IncomingMessage;
  const res = Object.assign(new EventEmitter(), {
    destroyed: false, writableEnded: false,
    writeHead() { assert.fail('Disconnected clients must not be written to'); },
    end() { assert.fail('Disconnected clients must not be written to'); },
  });
  let signal: AbortSignal | undefined;
  const middleware = apiMiddleware(async () => ({
    fetch: async request => {
      signal = request.signal;
      const stopped = new Promise<Response>((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }));
      res.destroyed = true; res.emit('close');
      return stopped;
    },
  }), {});
  await middleware(req, res as unknown as ServerResponse, () => assert.fail('API request must be handled'));
  assert.equal(signal?.aborted, true);
  assert.equal(res.listenerCount('close'), 0);
});
