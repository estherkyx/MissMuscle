// Explicit real-provider diagnostic, never imported by the app or npm test.
// Sends the specified JPEG repeatedly; this verifies completion, NOT movement.
// node --import tsx scripts/smoke-live-analysis.ts IMAGE WIDTH HEIGHT [FRAME_COUNT] [EXERCISE_ID]
import { readFileSync } from 'node:fs';
import { loadEnv } from 'vite';
import { analyzeClip } from '../server/analysis/analyze';
import { AnalysisRequestSchema } from '../shared/contracts';
import { ServiceError } from '../server/errors';

const [path, rawWidth, rawHeight, rawCount = '4', exerciseId = 'dumbbell_curl'] = process.argv.slice(2);
if (!path) throw new Error('Supply an explicitly selected JPEG. This sends it to OpenAI.');
const count = Number(rawCount);
const input = AnalysisRequestSchema.parse({
  clipId: 'synthetic-live-provider-probe', exerciseId, durationSec: 2.8,
  frames: Array.from({ length: count }, (_, index) => ({
    timestampSec: index * 2.8 / (count - 1), width: Number(rawWidth), height: Number(rawHeight),
    dataUrl: `data:image/jpeg;base64,${readFileSync(path).toString('base64')}`,
  })),
});
const env = { ...loadEnv('development', process.cwd(), ''), ...process.env };
const start = performance.now();
try {
  const report = await analyzeClip(input, env, {});
  console.log(JSON.stringify({ probe: 'repeated test image, not exercise footage', exerciseId, elapsedMs: Math.round(performance.now() - start),
    source: report.source, assessable: report.visibility.assessable, checks: report.formChecks?.length, corrections: report.corrections.length }));
} catch (error) {
  console.error(JSON.stringify({ elapsedMs: Math.round(performance.now() - start), code: error instanceof ServiceError ? error.code : 'PROBE_FAILED' }));
  process.exitCode = 1;
}
