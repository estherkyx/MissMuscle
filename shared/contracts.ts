import { z } from 'zod';

// Shared handoff. Both people import this file; coordinate schema changes.
export const LIMITS = {
  clipSeconds: 15,
  clipBytes: 40 * 1024 * 1024,
  maxFrames: 16,
  frameEdge: 768,
  frameDataUrlChars: 350_000,
  requestBytes: 6 * 1024 * 1024,
} as const;

export const ExerciseIdSchema = z.literal('dumbbell_curl');
const Seconds = z.number().finite().min(0).max(LIMITS.clipSeconds);
const Id = z.string().min(1).max(100);

export const FrameSchema = z.object({
  timestampSec: Seconds,
  dataUrl: z.string().max(LIMITS.frameDataUrlChars).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
  width: z.number().int().positive().max(LIMITS.frameEdge),
  height: z.number().int().positive().max(LIMITS.frameEdge),
});

export const AnalysisRequestSchema = z.object({
  clipId: Id,
  exerciseId: ExerciseIdSchema,
  durationSec: Seconds.gt(0),
  frames: z.array(FrameSchema).min(2).max(LIMITS.maxFrames),
}).superRefine((request, ctx) => {
  request.frames.forEach((frame, index) => {
    if (frame.timestampSec > request.durationSec || (index > 0 && frame.timestampSec <= request.frames[index - 1].timestampSec)) {
      ctx.addIssue({ code: 'custom', path: ['frames', index, 'timestampSec'], message: 'Frames must be strictly ordered and within the clip duration.' });
    }
  });
});

// Coordinates refer to the displayed video image, excluding letterboxing.
export const RegionSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
}).refine(r => r.x + r.width <= 1 && r.y + r.height <= 1, 'Region must fit inside the image.');

export const CorrectionSchema = z.object({
  id: Id,
  title: z.string().min(1).max(100),
  priority: z.enum(['focus_first', 'practice_next']),
  observation: z.string().min(1).max(500),
  cue: z.string().min(1).max(250),
  referenceCue: z.string().min(1).max(300),
  evidence: z.array(z.object({
    frameIndex: z.number().int().min(0).max(LIMITS.maxFrames - 1),
    timestampSec: Seconds,
    region: RegionSchema.nullable(),
  })).min(1).max(4),
});

export const AnalysisReportSchema = z.object({
  schemaVersion: z.literal('1'),
  id: Id,
  clipId: Id,
  exerciseId: ExerciseIdSchema,
  durationSec: Seconds.gt(0),
  source: z.enum(['fixture', 'astra']),
  summary: z.string().min(1).max(600),
  visibility: z.object({ assessable: z.boolean(), limitations: z.array(z.string().min(1).max(300)).max(6) }),
  targetMuscles: z.array(z.string().min(1).max(100)).min(1).max(5),
  corrections: z.array(CorrectionSchema).max(3),
  nextAttemptFocus: z.string().min(1).max(300),
}).superRefine((report, ctx) => {
  if (new Set(report.corrections.map(c => c.id)).size !== report.corrections.length) {
    ctx.addIssue({ code: 'custom', path: ['corrections'], message: 'Correction IDs must be unique.' });
  }
  if (!report.visibility.assessable && report.corrections.length) {
    ctx.addIssue({ code: 'custom', path: ['corrections'], message: 'Do not issue corrections for an unassessable clip.' });
  }
  for (const correction of report.corrections) {
    if (correction.evidence.some(e => e.timestampSec > report.durationSec)) {
      ctx.addIssue({ code: 'custom', path: ['corrections'], message: 'Evidence must be inside the clip duration.' });
    }
  }
});

// Validate model output against the actual request before returning it.
export function validateReportForRequest(value: unknown, request: AnalysisRequest): AnalysisReport {
  const report = AnalysisReportSchema.parse(value);
  if (report.clipId !== request.clipId || report.exerciseId !== request.exerciseId || report.durationSec !== request.durationSec) {
    throw new Error('Report does not belong to this clip.');
  }
  for (const correction of report.corrections) {
    for (const evidence of correction.evidence) {
      const frame = request.frames[evidence.frameIndex];
      if (!frame || Math.abs(frame.timestampSec - evidence.timestampSec) > 0.05) {
        throw new Error('Evidence does not match an uploaded frame.');
      }
    }
  }
  return report;
}

export const CoachCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('show_correction'), correctionId: Id }),
  z.object({ type: z.literal('seek_video'), timestampSec: Seconds }),
  z.object({ type: z.literal('pause_video') }),
  z.object({ type: z.literal('replay_segment'), startSec: Seconds, endSec: Seconds })
    .refine(c => c.endSec > c.startSec, 'Replay end must follow start.'),
]);

export const CoachContextSchema = z.object({
  report: AnalysisReportSchema,
  currentTimeSec: Seconds,
  selectedCorrectionId: Id.nullable(),
}).superRefine((context, ctx) => {
  if (context.currentTimeSec > context.report.durationSec) {
    ctx.addIssue({ code: 'custom', path: ['currentTimeSec'], message: 'Playback time is outside the clip.' });
  }
  if (context.selectedCorrectionId && !context.report.corrections.some(c => c.id === context.selectedCorrectionId)) {
    ctx.addIssue({ code: 'custom', path: ['selectedCorrectionId'], message: 'Unknown correction.' });
  }
});

// App-owned handshake, not the upstream OpenAI session schema.
export const LiveSessionRequestSchema = z.object({
  sdpOffer: z.string().min(1).max(100_000),
  context: CoachContextSchema,
});
export const LiveSessionResponseSchema = z.object({ sessionId: Id, sdpAnswer: z.string().min(1).max(100_000) });
export const ApiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;
export type Correction = z.infer<typeof CorrectionSchema>;
export type CoachCommand = z.infer<typeof CoachCommandSchema>;
export type CoachContext = z.infer<typeof CoachContextSchema>;
export type LiveSessionRequest = z.infer<typeof LiveSessionRequestSchema>;
export type LiveSessionResponse = z.infer<typeof LiveSessionResponseSchema>;
