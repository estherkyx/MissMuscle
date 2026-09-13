import test from 'node:test';
import assert from 'node:assert/strict';
import { demoReport } from '../../../shared/fixtures/demo-report';
import type { CoachContext } from '../../../shared/contracts';
import type { CoachConnection, CoachOptions } from '../voice/coach-client';
import { createCoachSession } from './coach-session';

const context: CoachContext = { report: demoReport, currentTimeSec: 0, selectedCorrectionId: null };
const options = (): CoachOptions => ({ context, onStatus: () => {}, onCommand: () => {}, onTranscript: () => {} });

test('late coach setup disconnects after stop and cannot issue stale commands', async () => {
  let resolve!: (connection: CoachConnection) => void;
  let saved!: CoachOptions;
  let starts = 0;
  let disconnects = 0;
  let commands = 0;
  const session = createCoachSession(input => { starts++; saved = input; return new Promise(done => { resolve = done; }); });
  const input = { ...options(), onCommand: () => { commands++; } };
  const start = session.start(input);
  void session.start(input);
  assert.equal(starts, 1);
  const stop = session.stop();
  saved.onCommand({ type: 'pause_video' });
  resolve({ disconnect: async () => { disconnects++; }, updateContext: () => assert.fail('Obsolete context must not be sent') });
  await Promise.all([start, stop]);
  assert.equal(commands, 0); assert.equal(disconnects, 1);
});

test('current selection reaches a connecting session and teardown completes before restart', async () => {
  let resolve!: (connection: CoachConnection) => void;
  let end!: () => void;
  let starts = 0;
  const contexts: CoachContext[] = [];
  const session = createCoachSession(() => { starts++; return new Promise(done => { resolve = done; }); });
  const start = session.start(options());
  session.updateContext({ ...context, currentTimeSec: 8, selectedCorrectionId: 'correction-2' });
  resolve({ updateContext: next => contexts.push(next), disconnect: () => new Promise(done => { end = done; }) });
  await start;
  assert.equal(contexts[0].selectedCorrectionId, 'correction-2');
  const stop = session.stop();
  void session.start(options());
  assert.equal(starts, 1);
  end(); await stop;
  const next = session.start(options());
  assert.equal(starts, 2);
  resolve({ updateContext: () => {}, disconnect: async () => {} });
  await next; await session.stop();
});

test('provider failure is surfaced rather than replaced with fake voice', async () => {
  const session = createCoachSession(async () => { throw new Error('Not implemented'); });
  await assert.rejects(session.start(options()), /Not implemented/);
  await session.stop();
});

test('ending during a failed setup does not prevent clip replacement', async () => {
  let reject!: (error: Error) => void;
  const session = createCoachSession(() => new Promise((_resolve, fail) => { reject = fail; }));
  const start = session.start(options());
  const failure = assert.rejects(start, /Provider unavailable/);
  const stopped = session.stop();
  reject(new Error('Provider unavailable'));
  await failure;
  await stopped;
});

test('failed disconnect retains the connection for a retry instead of opening a duplicate', async () => {
  let starts = 0; let disconnects = 0;
  const session = createCoachSession(async () => {
    starts++;
    return { updateContext: () => {}, disconnect: async () => { disconnects++; if (disconnects === 1) throw new Error('Disconnect failed'); } };
  });
  await session.start(options());
  await assert.rejects(session.stop(), /Disconnect failed/);
  await session.start(options());
  assert.equal(starts, 1);
  await session.stop();
  assert.equal(disconnects, 2);
});
