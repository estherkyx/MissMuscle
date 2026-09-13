import { ZodError } from 'zod';
import { AnalysisRequestSchema, LiveSessionRequestSchema, LiveSessionResponseSchema, LIMITS, validateReportForRequest } from '../shared/contracts';
import { demoReport } from '../shared/fixtures/demo-report';
import { analyzeClip } from './analysis/analyze';
import { createLiveSession } from './live/create-session';
import { ServiceError } from './errors';
import type { Env } from './env';

async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new ServiceError(415, 'JSON_REQUIRED', 'Send application/json.');
  }
  if (!request.body) throw new ServiceError(400, 'INVALID_JSON', 'A JSON body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > LIMITS.requestBytes) {
        await reader.cancel();
        throw new ServiceError(413, 'PAYLOAD_TOO_LARGE', 'Use fewer or smaller frames.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ServiceError(400, 'INVALID_JSON', 'Body must be valid JSON.'); }
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request: Request, env: Env = {}): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/api/health' && request.method === 'GET') {
        const state = env.OPENAI_API_KEY?.trim() ? 'configured' : 'missing_api_key';
        return json({ ok: true, analysis: state, voice: state, providerAccess: 'not_verified', models: { analysis: env.ASTRA_MODEL || 'gpt-6-astra', voice: env.LIVE_MODEL || 'gpt-live-1' } });
      }
      if (path === '/api/demo-report' && request.method === 'GET') return json(demoReport);
      if (path === '/api/analyze' && request.method === 'POST') {
        const input = AnalysisRequestSchema.parse(await readJson(request));
        const output = await analyzeClip(input, env);
        try { return json(validateReportForRequest(output, input)); }
        catch { throw new ServiceError(502, 'INVALID_MODEL_OUTPUT', 'The analysis did not match the clip. Please retry.'); }
      }
      if (path === '/api/live/session' && request.method === 'POST') {
        const input = LiveSessionRequestSchema.parse(await readJson(request));
        const output = await createLiveSession(input, env);
        try { return json(LiveSessionResponseSchema.parse(output)); }
        catch { throw new ServiceError(502, 'INVALID_LIVE_RESPONSE', 'The voice session could not be started.'); }
      }
      if (path.startsWith('/api/')) throw new ServiceError(404, 'NOT_FOUND', 'API route not found.');
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('MissMuscle API. Run npm run dev for the interface.', { status: 404 });
    } catch (error) {
      if (error instanceof ZodError) return json({ error: { code: 'INVALID_REQUEST', message: error.issues[0]?.message ?? 'Invalid request.' } }, 400);
      if (error instanceof ServiceError) return json({ error: { code: error.code, message: error.message } }, error.status);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } }, 500);
    }
  },
};
