import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EXERCISES, canAnalyzeExercise, getExercise } from './exercise-library';
import { MuscleGuide, ReferenceGuide } from './ReviewPanel';
import { ReferenceMotion } from '../video/ReferenceMotion';

test('every listed exercise can enter analysis; unknown selections cannot', () => {
  for (const exercise of EXERCISES) assert.equal(canAnalyzeExercise(exercise.id), true);
  assert.equal(canAnalyzeExercise(''), false);
});

test('each new exercise renders its own form reference and source, with no curl illustration', () => {
  for (const exercise of EXERCISES.filter(item => item.id !== 'dumbbell_curl')) {
    const html = renderToStaticMarkup(createElement(ReferenceGuide, { exercise }));
    assert.ok(html.includes(exercise.variation));
    assert.ok(html.includes(exercise.sources[0].url));
    assert.match(html, /MOVEMENT REFERENCE/);
    assert.doesNotMatch(html, /curl-reference.svg/);
    const animation = renderToStaticMarkup(createElement(ReferenceMotion, { exerciseId: exercise.id }));
    assert.ok(animation.includes(exercise.summary));
    assert.doesNotMatch(animation, /upper arms beside the body|visible arm|curl movement/i);
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
