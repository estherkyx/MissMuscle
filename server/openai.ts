import type { Env } from './env';
import { ServiceError } from './errors';

export function requireApiKey(env: Env): string {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw new ServiceError(503, 'OPENAI_KEY_MISSING', 'Set OPENAI_API_KEY in the server environment, then restart the dev server.');
  return key;
}

// Web fetch keeps the provider layer portable to the hosted Worker runtime.
// No automatic retries: session creation is billable and not idempotent.
export async function openaiPost(path: '/responses' | '/live/sessions', body: unknown, env: Env, timeoutMs = 70_000, signal?: AbortSignal): Promise<unknown> {
  const key = requireApiKey(env);
  let response: Response;
  try {
    response = await fetch(`https://api.openai.com/v1${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
      throw new ServiceError(504, 'OPENAI_TIMEOUT', 'OpenAI took too long to respond. Please try again.');
    }
    throw new ServiceError(502, 'OPENAI_UNREACHABLE', 'Could not reach OpenAI. Check the server connection and retry.');
  }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401) throw new ServiceError(503, 'OPENAI_AUTH_FAILED', 'The server API key was rejected. Check the project key.');
    if ([403, 404].includes(response.status)) throw new ServiceError(503, 'OPENAI_ACCESS_DENIED', 'This project cannot access the requested model or API. Check hackathon access for Astra and GPT-Live-1.');
    if (response.status === 429) throw new ServiceError(429, 'OPENAI_RATE_LIMIT', 'The OpenAI project hit a rate or quota limit. Check credits and retry shortly.');
    if (response.status === 400) throw new ServiceError(502, 'OPENAI_REQUEST_REJECTED', 'OpenAI rejected the request. Check the image input, model configuration, and current API setup.');
    throw new ServiceError(502, 'OPENAI_UPSTREAM_ERROR', 'OpenAI could not complete this request. Please try again.');
  }
  try { return await response.json(); }
  catch { throw new ServiceError(502, 'OPENAI_INVALID_RESPONSE', 'OpenAI returned an unreadable response.'); }
}
