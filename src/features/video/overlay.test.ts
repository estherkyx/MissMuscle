import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EvidenceOverlay } from './EvidenceOverlay';
import { demoReport } from '../../../shared/fixtures/demo-report';
import type { AnalysisRequest } from '../../../shared/contracts';

const report = { ...demoReport, source: 'astra' as const };
const correction = { ...report.corrections[0], evidence: [{ frameIndex: 0, timestampSec: 0, region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }] };
const request: AnalysisRequest = { clipId: report.clipId, exerciseId: 'dumbbell_curl', durationSec: 12, frames: [{ timestampSec: 0, width: 432, height: 768, dataUrl: 'data:image/jpeg;base64,/9j/2Q==' }] };

test('video highlight uses oriented frame coordinates and contains within the video viewport', () => {
  const html = renderToStaticMarkup(createElement(EvidenceOverlay, { report, correction, request, evidenceIndex: 0, visible: true }));
  assert.match(html, /viewBox="0 0 432 768"/);
  assert.match(html, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(html, /x="43.2" y="153.60000000000002"/);
});

test('video highlight is absent for fictional, stale, playing, and unlocalized evidence', () => {
  const base = { report, correction, request, evidenceIndex: 0, visible: true };
  for (const overrides of [
    { report: demoReport }, { request: { ...request, clipId: 'another-clip' } }, { visible: false },
    { correction: { ...correction, evidence: [{ ...correction.evidence[0], region: null }] } },
  ]) assert.equal(renderToStaticMarkup(createElement(EvidenceOverlay, { ...base, ...overrides })), '');
});
