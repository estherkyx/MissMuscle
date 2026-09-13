import { validateReportForRequest, type AnalysisRequest, type AnalysisReport } from '../../shared/contracts';
import type { Env } from '../env';
import { ServiceError } from '../errors';
import { openaiPost, requireApiKey } from '../openai';
import { AnalysisDraftSchema, analysisJsonSchema, ResponseEnvelopeSchema } from './schema';
import { ANALYSIS_INSTRUCTIONS, CURL_TARGET_MUSCLES } from './rubric';

export async function analyzeClip(request: AnalysisRequest, env: Env): Promise<AnalysisReport> {
  requireApiKey(env);
  // Reject obviously malformed bytes before paying for provider decoding.
  // OpenAI still performs actual image decoding; this is not a complete JPEG decoder.
  for (const frame of request.frames) {
    let image: string;
    try { image = atob(frame.dataUrl.split(',')[1]); }
    catch { throw new ServiceError(400, 'INVALID_IMAGE', 'A frame is not valid base64 JPEG data.'); }
    if (image.length < 4 || image.charCodeAt(0) !== 255 || image.charCodeAt(1) !== 216 || image.charCodeAt(image.length - 2) !== 255 || image.charCodeAt(image.length - 1) !== 217) {
      throw new ServiceError(400, 'INVALID_IMAGE', 'A frame is not a complete JPEG. Extract the clip frames again.');
    }
  }
  const content: Array<Record<string, unknown>> = [{
    type: 'input_text',
    text: `Exercise: conventional dumbbell curl. Duration: ${request.durationSec}s. There are ${request.frames.length} ordered frames. Only indices 0 through ${request.frames.length - 1} exist.`,
  }];
  request.frames.forEach((frame, index) => content.push(
    { type: 'input_text', text: `Frame ${index}; timestamp ${frame.timestampSec}s; image ${frame.width}x${frame.height}.` },
    { type: 'input_image', image_url: frame.dataUrl, detail: 'high' },
  ));
  const raw = await openaiPost('/responses', {
    model: env.ASTRA_MODEL || 'gpt-6-astra',
    instructions: ANALYSIS_INSTRUCTIONS,
    input: [{ role: 'user', content }],
    reasoning: { effort: 'low' },
    max_output_tokens: 6000,
    store: false,
    text: { format: { type: 'json_schema', name: 'exercise_analysis', strict: true, schema: analysisJsonSchema } },
  }, env);
  const envelope = ResponseEnvelopeSchema.safeParse(raw);
  if (!envelope.success) throw new ServiceError(502, 'INVALID_MODEL_OUTPUT', 'The analysis response was incomplete or unreadable.');
  if (envelope.data.status !== 'completed') throw new ServiceError(502, 'ANALYSIS_INCOMPLETE', 'The analysis did not finish. Try a shorter clip.');
  const parts = envelope.data.output.flatMap(item => item.content ?? []);
  if (parts.some(part => part.type === 'refusal')) throw new ServiceError(422, 'ANALYSIS_REFUSED', 'The model could not assess this clip. Try another exercise recording.');
  try {
    const draft = AnalysisDraftSchema.parse(JSON.parse(parts.filter(p => p.type === 'output_text').map(p => p.text ?? '').join('')));
    const report = {
      ...draft, schemaVersion: '1', id: crypto.randomUUID(), clipId: request.clipId,
      exerciseId: request.exerciseId, durationSec: request.durationSec, source: 'astra',
      targetMuscles: CURL_TARGET_MUSCLES,
      corrections: draft.corrections.map((correction, i) => ({
        ...correction, id: `correction-${i + 1}`,
        evidence: correction.evidence.map(evidence => {
          const frame = request.frames[evidence.frameIndex];
          if (!frame) throw new Error('Nonexistent evidence frame.');
          return { ...evidence, timestampSec: frame.timestampSec };
        }),
      })),
    };
    return validateReportForRequest(report, request);
  } catch {
    throw new ServiceError(502, 'INVALID_MODEL_OUTPUT', 'The model returned unsupported findings or evidence. Please retry.');
  }
}
