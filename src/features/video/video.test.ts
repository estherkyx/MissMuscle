import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { LIMITS, type AnalysisRequest } from '../../../shared/contracts';
import { demoReport } from '../../../shared/fixtures/demo-report';
import { sampleTimes, scaledSize, validateDuration, validateFile, validatePayload, waitForMedia } from './media';
import { createPlaybackController, regionStyle, validatePlaybackCommand } from './playback';

test('frame sampling covers short and full-length clips, strictly ordered before the endpoint', () => {
  for (const duration of [0.1, 5, 12, 15]) {
    const times = sampleTimes(duration);
    assert.equal(times.length, 16);
    assert.equal(times[0], 0);
    assert.ok(times.at(-1)! < duration && times.at(-1)! >= duration * 0.95);
    assert.ok(times.every((time, index) => index === 0 || time > times[index - 1]));
    assert.doesNotThrow(() => validatePayload({ clipId: 'clip', exerciseId: 'dumbbell_curl', durationSec: duration, frames: times.map(timestampSec => ({ timestampSec, width: 1, height: 1, dataUrl: 'data:image/jpeg;base64,/9j/AA==' })) }));
  }
});

test('upload validation handles boundaries and scaling preserves portrait/landscape orientation', () => {
  assert.throws(() => validateFile({ size: 0 }));
  assert.throws(() => validateFile({ size: LIMITS.clipBytes + 1 }));
  assert.doesNotThrow(() => validateFile({ size: LIMITS.clipBytes }));
  for (const duration of [NaN, Infinity, 0, -1, 15.01]) assert.throws(() => validateDuration(duration));
  assert.deepEqual(scaledSize(1920, 1080), { width: 768, height: 432 });
  assert.deepEqual(scaledSize(1080, 1920), { width: 432, height: 768 });
  assert.deepEqual(scaledSize(320, 180), { width: 320, height: 180 });
});

test('payload validation rejects oversized images and malformed chronology', () => {
  const input: AnalysisRequest = { clipId: 'clip', exerciseId: 'dumbbell_curl', durationSec: 1, frames: [0, 0.5].map(timestampSec => ({ timestampSec, width: 1, height: 1, dataUrl: 'data:image/jpeg;base64,/9j/AA==' })) };
  input.frames[1].timestampSec = 0;
  assert.throws(() => validatePayload(input));
  input.frames[1].timestampSec = 0.5;
  input.frames[1].dataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(LIMITS.frameDataUrlChars);
  assert.throws(() => validatePayload(input));
});

test('media event waits handle success, decode failure and cancellation without continuing', async () => {
  const media = new EventTarget() as HTMLVideoElement;
  await waitForMedia(media, 'seeked', new AbortController().signal, () => media.dispatchEvent(new Event('seeked')));
  await assert.rejects(waitForMedia(media, 'seeked', new AbortController().signal, () => media.dispatchEvent(new Event('error'))), /decoded/);
  const abort = new AbortController();
  const pending = waitForMedia(media, 'seeked', abort.signal);
  abort.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  let started = false;
  await assert.rejects(waitForMedia(media, 'seeked', abort.signal, () => { started = true; }), { name: 'AbortError' });
  assert.equal(started, false);
});

test('commands reject unknown corrections and active-clip bounds, not just global limits', () => {
  for (const value of [
    { type: 'show_correction', correctionId: 'missing' },
    { type: 'seek_video', timestampSec: 8 },
    { type: 'seek_video', timestampSec: NaN },
    { type: 'replay_segment', startSec: 3, endSec: 7 },
    { type: 'replay_segment', startSec: 3, endSec: 1 },
    { type: 'execute_script' },
  ]) assert.throws(() => validatePlaybackCommand(value, 6, demoReport));
  assert.doesNotThrow(() => validatePlaybackCommand({ type: 'seek_video', timestampSec: 6 }, 6, demoReport));
  assert.deepEqual(regionStyle({ x: 0.25, y: 0.1, width: 0.5, height: 0.4 }), { left: '25%', top: '10%', width: '50%', height: '40%' });
});

test('a media seek that never completes times out', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const media = new EventTarget() as HTMLVideoElement;
  const failure = assert.rejects(waitForMedia(media, 'seeked', new AbortController().signal), /timed out/);
  t.mock.timers.tick(12_000);
  await failure;
});

class FakeVideo extends EventTarget {
  private time = 0;
  paused = true;
  seeking = false;
  plays = 0;
  get currentTime() { return this.time; }
  set currentTime(value: number) {
    this.time = value; this.seeking = true;
    queueMicrotask(() => { this.dispatchEvent(new Event('seeking')); this.seeking = false; this.dispatchEvent(new Event('seeked')); });
  }
  pause() { if (!this.paused) { this.paused = true; queueMicrotask(() => this.dispatchEvent(new Event('pause'))); } }
  play() { this.paused = false; this.plays++; this.dispatchEvent(new Event('play')); return Promise.resolve(); }
  advance(time: number) { this.time = time; this.dispatchEvent(new Event('timeupdate')); }
}

test('click and voice share evidence seeking; replay ends and later commands cancel earlier replay', async t => {
  const originalRequest = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const originalCancel = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: () => 1 });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: () => {} });
  t.after(() => {
    if (originalRequest) Object.defineProperty(globalThis, 'requestAnimationFrame', originalRequest);
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    if (originalCancel) Object.defineProperty(globalThis, 'cancelAnimationFrame', originalCancel);
    else Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
  });
  const media = new FakeVideo();
  const selected: string[] = [];
  const errors: string[] = [];
  const controller = createPlaybackController({ video: media as unknown as HTMLVideoElement, getDuration: () => 12, getReport: () => demoReport, onSelect: id => selected.push(id), onSettled: () => {}, onError: message => errors.push(message) });
  controller.handleCoachCommand({ type: 'show_correction', correctionId: 'correction-2' });
  await setImmediate();
  assert.equal(media.currentTime, 8); assert.equal(media.paused, true);
  controller.showEvidence('correction-1', 0);
  await setImmediate();
  assert.equal(media.currentTime, 4); assert.deepEqual(selected, ['correction-2', 'correction-1']);
  controller.handleCoachCommand({ type: 'replay_segment', startSec: 2, endSec: 3 });
  await setImmediate();
  assert.equal(media.paused, false);
  media.advance(3.1);
  await setImmediate();
  assert.equal(media.paused, true); assert.equal(media.currentTime, 3);
  controller.handleCoachCommand({ type: 'replay_segment', startSec: 1, endSec: 2 });
  controller.handleCoachCommand({ type: 'show_correction', correctionId: 'correction-2' });
  await setImmediate();
  assert.equal(media.currentTime, 8); assert.equal(media.paused, true); assert.equal(media.plays, 1);
  controller.dispose();
  controller.handleCoachCommand({ type: 'seek_video', timestampSec: 1 });
  assert.equal(media.currentTime, 8); assert.deepEqual(errors, []);
});
