import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReferenceMotion } from './ReferenceMotion';

test('every exercise keeps a visible reference without separate playback controls when tracking or repetition timing is missing', () => {
  for (const exerciseId of ['dumbbell_curl','lat_pulldown','leg_extension','dumbbell_front_squat'] as const) {
    const html = renderToStaticMarkup(createElement(ReferenceMotion, {exerciseId, status:'Clip synchronization failed.'}));
    assert.match(html, /<canvas/);
    assert.match(html, /ILLUSTRATED EXAMPLE/);
    assert.doesNotMatch(html, /Play example|Explore the movement|type="range"/);
    assert.match(html, /waiting for movement/);
    assert.match(html, /Clip synchronization failed/);
    assert.doesNotMatch(html, /mapped-empty/);
  }
});

test('missing facing no longer hides a reference with reliable movement timing', () => {
  const html = renderToStaticMarkup(createElement(ReferenceMotion, {exerciseId:'dumbbell_curl',
    motion:{time:1.2,progress:0.5,direction:'Lifting'}}));
  assert.match(html, /1.20s \/ SYNCED/);
  assert.match(html, /example camera angle/);
  assert.doesNotMatch(html, /mapped-empty|Play example/);
});

test('live reference is an independent template even when observed phase and facing change',()=>{
  const render=(progress:number,yaw:number)=>renderToStaticMarkup(createElement(ReferenceMotion,{
    exerciseId:'dumbbell_curl',live:true,motion:{time:4,progress,direction:'Lifting'},view:{yaw,held:false}}));
  assert.equal(render(0,0),render(1,Math.PI));
  assert.match(render(0,0),/LOOPING EXAMPLE/);
  assert.doesNotMatch(render(0,0),/SYNCED|waiting for movement|movement automatically|type="range"/);
});
