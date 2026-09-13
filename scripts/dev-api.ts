// Development adapter only. Production server code uses Web Request/Response.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Env } from '../server/env';
import { LIMITS } from '../shared/contracts';

type Worker = { fetch(request: Request, env: Env): Promise<Response> };

export function apiMiddleware(loadWorker: () => Promise<Worker>, env: Env) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/')) return next();
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > LIMITS.requestBytes) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Use fewer or smaller frames.' } }));
          return;
        }
        chunks.push(buffer);
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const body = Buffer.concat(chunks);
      const request = new Request(new URL(req.url, 'http://localhost'), {
        method: req.method,
        headers,
        ...(body.length ? { body: new Uint8Array(body) } : {}),
      });
      const response = await (await loadWorker()).fetch(request, env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'DEV_SERVER_ERROR', message: 'Local API adapter failed.' } }));
    }
  };
}
