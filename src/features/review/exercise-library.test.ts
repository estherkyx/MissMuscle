import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EXERCISES, canAnalyzeExercise, getExercise } from './exercise-library';
import { MuscleGuide, ReferenceGuide } from './ReviewPanel';

test('reference-only exercises cannot enter the curl analysis flow', () => {
  for (const exercise of EXERCISES) assert.equal(canAnalyzeExercise(exercise.id), exercise.id === 'dumbbell_curl');
  assert.equal(canAnalyzeExercise(''), false);
});

test('each new exercise renders its own form reference and source, with no curl illustration', () => {
  for (const exercise of EXERCISES.filter(item => !item.analysisAvailable)) {
    const html = renderToStaticMarkup(createElement(ReferenceGuide, { exercise }));
    assert.ok(html.includes(exercise.variation));
    assert.ok(html.includes(exercise.sources[0].url));
    assert.match(html, /MOVEMENT REFERENCE/);
    assert.doesNotMatch(html, /curl-reference.svg/);
  }
});

test('squat reference shows both target muscles without requiring a selection', () => {
  const exercise = getExercise('dumbbell_front_squat')!;
  const html = renderToStaticMarkup(createElement(MuscleGuide, { exercise }));
  assert.match(html, /FRONT VIEW/);
  assert.match(html, /BACK VIEW/);
  assert.match(html, /Quadriceps/);
  assert.match(html, /Gluteus maximus/);
});
