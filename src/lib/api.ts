import { LIVE_TIMING } from '../../shared/live-timing';
import { z } from 'zod';
import { LiveInspectionRequestSchema, LiveInspectionResultSchema, type LiveInspectionRequest, AnalysisRequestSchema, AnalysisReportSchema, ApiErrorSchema, LiveSessionRequestSchema, LiveSessionResponseSchema, type AnalysisRequest, type LiveSessionRequest } from '../../shared/contracts';

export class ApiRequestError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(value);
    throw new ApiRequestError(parsed.success ? parsed.data.error.code : 'REQUEST_FAILED', parsed.success ? parsed.data.error.message : `Request failed (${response.status}).`);
  }
  return schema.parse(value);
}

export const getDemoReport = () => request('/api/demo-report', AnalysisReportSchema);
export const analyzeClip = (input: AnalysisRequest) => request('/api/analyze', AnalysisReportSchema, AnalysisRequestSchema.parse(input));
export const startLiveSession = (input: LiveSessionRequest) => request('/api/live/session', LiveSessionResponseSchema, LiveSessionRequestSchema.parse(input));

export async function inspectLiveWindow(input: LiveInspectionRequest, signal: AbortSignal) {
  // Let the server finish its own deadline and return a typed error before the
  // browser deadline fires; upload/network time is outside the provider budget.
  const deadline = AbortSignal.timeout(LIVE_TIMING.analysisTimeoutMs + LIVE_TIMING.analysisTransportGraceMs);
  try {
    return await request('/api/live/analyze', LiveInspectionResultSchema, LiveInspectionRequestSchema.parse(input), AbortSignal.any([signal, deadline]));
  } catch (error) {
    if (!signal.aborted && ((error instanceof ApiRequestError && error.code === 'OPENAI_TIMEOUT') || deadline.aborted)) {
      throw new ApiRequestError('OPENAI_TIMEOUT', 'Movement analysis timed out. Checking fresh movement automatically.');
    }
    throw error;
  }
}
