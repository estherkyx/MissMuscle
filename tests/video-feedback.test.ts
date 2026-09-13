import test from 'node:test';
import assert from 'node:assert/strict';
import { videoFeedback } from '../shared/video-feedback';

test('frame references use actual timestamps, never index numbers as seconds', () => {
  const evidence = [{ frameIndex: 4, timestampSec: 2.75 }, { frameIndex: 8, timestampSec: 6.2 }];
  assert.equal(videoFeedback('In frames 4 and 8, your wrist bends.', evidence), 'At 2.75s and 6.2s, your wrist bends.');
  assert.doesNotMatch(videoFeedback('In frame 15, your wrist bends.', evidence), /15s|frame/);
});
test('sampling advice is replaced by a concise limitation, preserving useful observations', () => {
  const text = videoFeedback('Your torso leans back at 4s. Clearer, more closely spaced images would help assess wrists and movement control.');
  assert.match(text, /Your torso leans back at 4s/);
  assert.match(text, /isn’t clear enough to assess from the video/);
  assert.doesNotMatch(text, /images|closely spaced/);
  assert.equal(videoFeedback('Your wrist is out of frame.'), 'Your wrist is out of view.');
});
