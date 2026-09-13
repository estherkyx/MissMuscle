import { z } from 'zod';
import { FormCriterionIdSchema, FormStatusSchema } from '../../shared/contracts';

// Provider output excludes IDs/timestamps/clip metadata: the server owns those.
// No refinements here; the shared report validator applies geometric/temporal checks.
export const AnalysisDraftSchema = z.object({
  summary: z.string().min(1).max(600),
  visibility: z.object({
    assessable: z.boolean(),
    limitations: z.array(z.string().min(1).max(300)).max(6),
  }),
  formChecks: z.array(z.object({
    criterionId: FormCriterionIdSchema,
    status: FormStatusSchema,
    note: z.string().min(1).max(250),
    evidence: z.array(z.object({ frameIndex: z.number().int().min(0).max(15) })).max(4),
  })).min(3).max(5),
  corrections: z.array(z.object({
    title: z.string().min(1).max(100),
    priority: z.enum(['focus_first', 'practice_next']),
    observation: z.string().min(1).max(500),
    cue: z.string().min(1).max(250),
    referenceCue: z.string().min(1).max(300),
    evidence: z.array(z.object({
      frameIndex: z.number().int().min(0).max(15),
      region: z.object({
        x: z.number().min(0).max(1), y: z.number().min(0).max(1),
        width: z.number().min(0).max(1), height: z.number().min(0).max(1),
      }).nullable(),
    })).min(1).max(4),
  })).max(3),
  nextAttemptFocus: z.string().min(1).max(300),
});

export const analysisJsonSchema = z.toJSONSchema(AnalysisDraftSchema, { target: 'draft-7' });

export const ResponseEnvelopeSchema = z.object({
  status: z.string(),
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  })),
});
