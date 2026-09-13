import { z } from 'zod';
import { LiveInspectionRequestSchema, LiveInspectionResultSchema, type LiveInspectionRequest, AnalysisRequestSchema, AnalysisReportSchema, ApiErrorSchema, LiveSessionRequestSchema, LiveSessionResponseSchema, type AnalysisRequest, type LiveSessionRequest } from '../../shared/contracts';

async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
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

export const inspectLiveWindow = (input: LiveInspectionRequest, signal: AbortSignal) => request('/api/live/analyze', LiveInspectionResultSchema, LiveInspectionRequestSchema.parse(input), AbortSignal.any([signal, AbortSignal.timeout(20_000)]));
