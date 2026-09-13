import type { LiveSessionRequest, LiveSessionResponse } from '../../shared/contracts';
import { z } from 'zod';
import { buildCoachInstructions, COACH_TOOLS, LIVE_INSTRUCTIONS, LIVE_EXERCISE_INSTRUCTIONS, LIVE_EXERCISE_TOOLS, AUTOMATIC_COACH_INSTRUCTIONS } from '../../shared/coach-config';
import type { Env } from '../env';
import { ServiceError } from '../errors';
import { openaiPost } from '../openai';

const UpstreamSessionSchema = z.object({
  session: z.object({ id: z.string().min(1).max(100) }),
  transport: z.object({ type: z.literal('webrtc'), sdp: z.string().min(1).max(100_000) }),
});

export async function createLiveSession(request: LiveSessionRequest, env: Env): Promise<LiveSessionResponse> {
  const raw = await openaiPost('/live/sessions', {
    session: {
      model: env.LIVE_MODEL || 'gpt-live-1',
      instructions: 'mode' in request.context ? request.context.guidanceOnly ? AUTOMATIC_COACH_INSTRUCTIONS : LIVE_EXERCISE_INSTRUCTIONS : LIVE_INSTRUCTIONS,
      delegation: {
        type: 'responses',
        responses: {
          model: env.ASTRA_MODEL || 'gpt-6-astra',
          instructions: buildCoachInstructions(request.context),
          tools: 'mode' in request.context ? request.context.guidanceOnly ? [] : LIVE_EXERCISE_TOOLS : COACH_TOOLS,
          tool_choice: 'auto',
          parallel_tool_calls: false,
          reasoning: { effort: 'low' },
          max_output_tokens: 3000,
        },
      },
    },
    transport: { type: 'webrtc', sdp: request.sdpOffer },
  }, env, 25_000);
  const parsed = UpstreamSessionSchema.safeParse(raw);
  if (!parsed.success) throw new ServiceError(502, 'INVALID_LIVE_RESPONSE', 'OpenAI returned an invalid voice-session handshake.');
  return { sessionId: parsed.data.session.id, sdpAnswer: parsed.data.transport.sdp };
}
