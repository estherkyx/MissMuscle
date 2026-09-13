// Explicit real-provider check. Never part of npm test.
// Usage: node --import tsx scripts/smoke-analysis.ts /absolute/path/to/image.jpg WIDTH HEIGHT
import { readFileSync } from 'node:fs';
import { loadEnv } from 'vite';
import { analyzeClip } from '../server/analysis/analyze';
import { AnalysisRequestSchema } from '../shared/contracts';
import { ServiceError } from '../server/errors';

const path = process.argv[2];
const width = Number(process.argv[3]);
const height = Number(process.argv[4]);
if (!path || !width || !height) throw new Error('Supply a JPEG path and its actual WIDTH HEIGHT (each <=768). This sends that image to OpenAI.');
const dataUrl = `data:image/jpeg;base64,${readFileSync(path).toString('base64')}`;
const env = { ...loadEnv('development', process.cwd(), ''), ...process.env };
const request = AnalysisRequestSchema.parse({
  clipId: 'provider-smoke', exerciseId: 'dumbbell_curl', durationSec: 2,
  // Repeating a single image tests API/schema, not movement accuracy.
  frames: [0, 1].map(timestampSec => ({ timestampSec, dataUrl, width, height })),
});
try {
  const report = await analyzeClip(request, env);
  console.log(JSON.stringify({ source: report.source, assessable: report.visibility.assessable, correctionCount: report.corrections.length, summary: report.summary }, null, 2));
} catch (error) {
  if (error instanceof ServiceError) console.error(`${error.code}: ${error.message}`);
  else console.error('Analysis smoke test failed.');
  process.exitCode = 1;
}
