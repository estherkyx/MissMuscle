import { z } from 'zod';
import { AnalysisReportSchema, CorrectionSchema, validateReportForRequest, type AnalysisRequest, type AnalysisReport } from '../../shared/contracts';
import type { Env } from '../env';
import { ServiceError } from '../errors';

import { ANALYSIS_INSTRUCTIONS } from './prompt';

// Reuse contract fields; the server assigns identities and evidence timestamps.
const FindingSchema = z.object({
  ...CorrectionSchema.omit({ id: true, evidence: true }).shape,
  evidence: z.array(CorrectionSchema.shape.evidence.element.omit({ timestampSec: true })).min(1).max(4),
});
const FindingsSchema = z.object({
  summary: AnalysisReportSchema.shape.summary,
  visibility: AnalysisReportSchema.shape.visibility,
  targetMuscles: AnalysisReportSchema.shape.targetMuscles,
  nextAttemptFocus: AnalysisReportSchema.shape.nextAttemptFocus,
  corrections: z.array(FindingSchema).max(3),
});
// JSON Schema supplies structural constraints; Zod also checks refinements.
const outputSchema = z.toJSONSchema(FindingsSchema, { target: 'draft-7' });
const EnvelopeSchema = z.object({
  status: z.string(),
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  })),
});

export async function analyzeClip(request: AnalysisRequest, env: Env): Promise<AnalysisReport> {
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new ServiceError(503, 'ANALYSIS_NOT_CONFIGURED', 'Set OPENAI_API_KEY in the project-root .env and restart the dev server (or configure the hosted server secret).');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.ASTRA_MODEL ?? 'gpt-6-astra', store: false,
        instructions: ANALYSIS_INSTRUCTIONS,
        input: [{ role: 'user', content: [
          { type: 'input_text', text: `Exercise: ${request.exerciseId}. Duration: ${request.durationSec} seconds. Review these ${request.frames.length} ordered sampled frames.` },
          ...request.frames.flatMap((frame, frameIndex) => [
            { type: 'input_text', text: `Frame index ${frameIndex}; timestamp ${frame.timestampSec} seconds.` },
            { type: 'input_image', image_url: frame.dataUrl, detail: 'high' },
          ]),
        ] }],
        text: { format: { type: 'json_schema', name: 'curl_findings', strict: true, schema: outputSchema } },
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if ([401, 403, 404].includes(response.status)) throw new ServiceError(503, 'ASTRA_ACCESS_ERROR', 'Check the server API key and account access to the configured Astra model.');
      if (response.status === 429) throw new ServiceError(429, 'ASTRA_RATE_LIMITED', 'Astra is rate limited or the account quota is exhausted. Check API billing/quota and retry shortly.');
      if (response.status === 400) throw new ServiceError(502, 'ASTRA_REQUEST_REJECTED', 'Astra rejected the analysis request. Check model compatibility and try another clip with valid JPEG frames.');
      throw new ServiceError(502, 'ASTRA_UNAVAILABLE', 'Astra could not complete the analysis. Please retry shortly.');
    }
    try {
      const envelope = EnvelopeSchema.parse(await response.json());
      const content = envelope.output.filter(item => item.type === 'message').flatMap(item => item.content ?? []);
      if (content.some(item => item.type === 'refusal')) throw new ServiceError(422, 'ANALYSIS_REFUSED', 'Astra could not review this clip. Try a clear recording of a dumbbell curl.');
      if (envelope.status !== 'completed') throw new Error('Incomplete response');
      const findings = FindingsSchema.parse(JSON.parse(content.filter(item => item.type === 'output_text').map(item => item.text ?? '').join('')));
      return validateReportForRequest({
        ...findings, schemaVersion: '1', id: crypto.randomUUID(), source: 'astra',
        clipId: request.clipId, exerciseId: request.exerciseId, durationSec: request.durationSec,
        corrections: findings.corrections.map((correction, index) => ({
          ...correction, id: `correction-${index + 1}`,
          evidence: correction.evidence.map(evidence => {
            const frame = request.frames[evidence.frameIndex];
            if (!frame) throw new Error('Unknown frame');
            return { ...evidence, timestampSec: frame.timestampSec };
          }),
        })),
      }, request);
    } catch (error) {
      if (controller.signal.aborted || error instanceof ServiceError) throw error;
      throw new ServiceError(502, 'INVALID_MODEL_OUTPUT', 'Astra returned an incomplete or invalid report. Please retry the analysis.');
    }
  } catch (error) {
    if (controller.signal.aborted) throw new ServiceError(504, 'ASTRA_TIMEOUT', 'Astra analysis timed out. Please retry.');
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(502, 'ASTRA_CONNECTION_ERROR', 'Could not reach Astra. Check the server network connection and retry.');
  } finally {
    clearTimeout(timeout);
  }
}
