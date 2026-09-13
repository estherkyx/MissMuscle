import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoReport } from '../../../shared/fixtures/demo-report';
import { ReviewPanel } from './ReviewPanel';

test('fixture review never renders submitted-frame images even if a request is supplied', () => {
  const html = renderToStaticMarkup(createElement(ReviewPanel, {
    report: demoReport, correction: demoReport.corrections[0], evidenceIndex: 0,
    request: { clipId: demoReport.clipId, exerciseId: 'dumbbell_curl', durationSec: 12, frames: Array.from({ length: 12 }, (_, timestampSec) => ({ timestampSec, width: 1, height: 1, dataUrl: 'data:image/jpeg;base64,/9j/AA==' })) },
    showKeyframe: true, hasVideo: true, onCorrection: () => {}, onEvidence: () => {},
  }));
  assert.match(html, /Fictional sample findings/);
  assert.doesNotMatch(html, /<img|class="region"/);
});

test('empty and unassessable reports do not invent corrections or imply perfect form', () => {
  for (const assessable of [true, false]) {
    const report = { ...demoReport, source: 'astra' as const, corrections: [], visibility: { assessable, limitations: assessable ? [] : ['Working arm obscured.'] } };
    const html = renderToStaticMarkup(createElement(ReviewPanel, { report, correction: undefined, evidenceIndex: 0, request: null, showKeyframe: false, hasVideo: true, onCorrection: () => {}, onEvidence: () => {} }));
    assert.doesNotMatch(html, /class="correction"|Fictional sample/);
    assert.match(html, assessable ? /does not assess every moment/ : /Working arm obscured/);
  }
});
