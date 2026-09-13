import { z } from 'zod';
import { AnalysisRequestSchema, AnalysisReportSchema, ApiErrorSchema, LiveSessionRequestSchema, LiveSessionResponseSchema, type AnalysisRequest, type LiveSessionRequest } from '../../shared/contracts';

async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(90_000),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(value);
    throw new Error(parsed.success ? parsed.data.error.message : `Request failed (${response.status}).`);
  }
  return schema.parse(value);
}

export const getDemoReport = () => request('/api/demo-report', AnalysisReportSchema);
export const analyzeClip = (input: AnalysisRequest) => request('/api/analyze', AnalysisReportSchema, AnalysisRequestSchema.parse(input));
export const startLiveSession = (input: LiveSessionRequest) => request('/api/live/session', LiveSessionResponseSchema, LiveSessionRequestSchema.parse(input));
