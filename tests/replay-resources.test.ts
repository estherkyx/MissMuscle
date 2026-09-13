import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplayResources } from '../src/features/live/replay-resources';
import { chooseRecordingType, type RecordingWindow } from '../src/features/live/recording';

const recording: RecordingWindow = { id: 'recording', startSec: 0, endSec: 5, segments: [
  { id: 'segment', startSec: 0, endSec: 5, blob: new Blob(['explicit test fixture']), ready: Promise.resolve() },
] };
test('effect cleanup and setup recreates playable URLs for the same recording', async () => {
  const first = createReplayResources(recording);
  const firstUrl = first.urls.get('segment')!;
  assert.equal(await (await fetch(firstUrl)).text(), 'explicit test fixture');
  first.release(); await assert.rejects(fetch(firstUrl));
  const second = createReplayResources(recording);
  try {
    const secondUrl = second.urls.get('segment')!;
    assert.notEqual(secondUrl, firstUrl);
    first.release(); // Old cleanup cannot revoke the new effect's resources.
    assert.equal(await (await fetch(secondUrl)).text(), 'explicit test fixture');
  } finally { second.release(); }
});
test('replay does not create URLs for empty or unfinished recordings', () => {
  const resources = createReplayResources({ ...recording, segments: recording.segments.map(segment => ({ ...segment, blob: new Blob([]) })) });
  assert.equal(resources.urls.size, 0); resources.release();
});
test('recording format must support both capture and playback', () => {
  assert.equal(chooseRecordingType(() => true, type => type === 'video/mp4'), 'video/mp4');
  assert.equal(chooseRecordingType(type => type.startsWith('video/webm'), () => true), 'video/webm;codecs=vp8');
  assert.throws(() => chooseRecordingType(() => true, () => false), /no supported recording and replay format/);
});
