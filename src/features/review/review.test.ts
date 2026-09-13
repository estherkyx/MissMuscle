import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoReport } from '../../../shared/fixtures/demo-report';
import { ReviewPanel } from './ReviewPanel';
import { FormChecklist } from './FormChecklist';

test('fixture review stays labelled and does not draw evidence images', () => {
  const html = renderToStaticMarkup(createElement(ReviewPanel, {
    report: demoReport, correction: demoReport.corrections[0], evidenceIndex: 0,
    showKeyframe: true, hasVideo: true, onCorrection: () => {}, onEvidence: () => {},
  }));
  assert.match(html, /Fictional sample findings/);
  assert.doesNotMatch(html, /<img|class="region"/);
  assert.match(html, /id="findings-title">Analysis/);
  assert.doesNotMatch(html, /Analysis notes|Your next rep|Tap a moment|Your corrections/);
  assert.match(html, /aria-expanded="true"/);
});

test('empty and unassessable reports do not invent corrections or imply perfect form', () => {
  for (const assessable of [true, false]) {
    const report = { ...demoReport, formChecks: undefined, source: 'astra' as const, corrections: [], visibility: { assessable, limitations: assessable ? [] : ['Working arm obscured.'] } };
    const html = renderToStaticMarkup(createElement(ReviewPanel, { report, correction: undefined, evidenceIndex: 0, showKeyframe: false, hasVideo: true, onCorrection: () => {}, onEvidence: () => {} }));
    assert.doesNotMatch(html, /class="correction"|Fictional sample/);
    assert.match(html, assessable ? /does not assess every moment/ : /Working arm obscured/);
    assert.doesNotMatch(html, /Looks consistent|Needs attention/);
    assert.equal((html.match(/class="check-status">Unclear/g) ?? []).length, 5);
  }
});

test('checklist renders explicit assessments with expandable timestamp evidence', () => {
  const html = renderToStaticMarkup(createElement(FormChecklist, { report: demoReport, onSeek: () => {} }));
  assert.match(html, /Bend at the elbow with the upper arm relatively steady beside the torso/);
  assert.match(html, /Keep the hand and forearm aligned/);
  assert.match(html, /Looks consistent/); assert.match(html, /Needs attention/); assert.match(html, /Unclear/);
  assert.match(html, /Jump to 4s/); assert.match(html, /Jump to 8s/);
  assert.equal((html.match(/<details/g) ?? []).length, 5);
  assert.doesNotMatch(html, / open=""/);
});
