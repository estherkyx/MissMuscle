import test from 'node:test';
import assert from 'node:assert/strict';
import { AnalysisReportSchema, AnalysisRequestSchema, CoachCommandSchema, CoachContextSchema, validateReportForRequest } from '../shared/contracts';
import { demoReport } from '../shared/fixtures/demo-report';

// Syntax fixture only; provider image decoding is an integration check.
const request = () => AnalysisRequestSchema.parse({
  clipId: demoReport.clipId, exerciseId: 'dumbbell_curl', durationSec: 12,
  frames: Array.from({ length: 12 }, (_, timestampSec) => ({ timestampSec, width: 1, height: 1, dataUrl: 'data:image/jpeg;base64,/9j/AA==' })),
});

test('sample report satisfies the same contract as real reports', () => {
  assert.equal(validateReportForRequest(demoReport, request()).source, 'fixture');
});
test('unordered or out-of-duration frames are rejected', () => {
  const input = request();
  input.frames[2].timestampSec = 1;
  assert.equal(AnalysisRequestSchema.safeParse(input).success, false);
  input.frames[2].timestampSec = 13;
  assert.equal(AnalysisRequestSchema.safeParse(input).success, false);
});
test('stale clip reports and fabricated frame references are rejected', () => {
  assert.throws(() => validateReportForRequest({ ...demoReport, clipId: 'old-clip' }, request()));
  const report = structuredClone(demoReport);
  report.corrections[0].evidence[0].timestampSec = 4.5;
  assert.throws(() => validateReportForRequest(report, request()));
});
test('unassessable clips cannot contain corrections', () => {
  assert.equal(AnalysisReportSchema.safeParse({ ...demoReport, visibility: { assessable: false, limitations: ['Arm obscured.'] } }).success, false);
});
test('regions outside the image and duplicate correction IDs are rejected', () => {
  const report = structuredClone(demoReport);
  report.corrections[0].evidence[0].region = { x: .9, y: 0, width: .2, height: .2 };
  assert.equal(AnalysisReportSchema.safeParse(report).success, false);
  assert.equal(AnalysisReportSchema.safeParse({ ...demoReport, corrections: [demoReport.corrections[0], demoReport.corrections[0]] }).success, false);
});
test('voice context must refer to the current report', () => {
  assert.equal(CoachContextSchema.safeParse({ report: demoReport, currentTimeSec: 8, selectedCorrectionId: 'correction-2' }).success, true);
  assert.equal(CoachContextSchema.safeParse({ report: demoReport, currentTimeSec: 13, selectedCorrectionId: null }).success, false);
  assert.equal(CoachContextSchema.safeParse({ report: demoReport, currentTimeSec: 8, selectedCorrectionId: 'missing' }).success, false);
});
test('voice commands reject unsupported actions and invalid replay ranges', () => {
  assert.equal(CoachCommandSchema.safeParse({ type: 'show_correction', correctionId: 'correction-2' }).success, true);
  assert.equal(CoachCommandSchema.safeParse({ type: 'run_code', code: 'anything' }).success, false);
  assert.equal(CoachCommandSchema.safeParse({ type: 'replay_segment', startSec: 9, endSec: 6 }).success, false);
});
