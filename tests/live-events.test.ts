import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveEventProcessor, commandFromCall } from '../src/features/voice/live-events';
import { demoReport } from '../shared/fixtures/demo-report';
import type { CoachCommand } from '../shared/contracts';

const context = { report: demoReport, currentTimeSec: 0, selectedCorrectionId: null };
function harness() {
  const commands: CoachCommand[] = [];
  const sent: Record<string, unknown>[] = [];
  const transcripts: unknown[] = [];
  const errors: string[] = [];
  let closed = false;
  const processor = createLiveEventProcessor({
    getContext: () => context, onCommand: c => commands.push(c), send: e => sent.push(e),
    onTranscript: e => transcripts.push(e), onStarted() {}, onClosed() { closed = true; }, onError: e => errors.push(e),
  });
  const feed = (event: unknown) => processor.handle({ type: 'response.event', delegation_id: 'delegation-1', event });
  return { processor, feed, commands, sent, transcripts, errors, closed: () => closed };
}
function call(name = 'show_correction', args = '{"correctionId":"correction-2"}', callId = 'call-1') {
  return { type: 'response.output_item.done', item: { type: 'function_call', call_id: callId, name, arguments: args } };
}

test('show-me command executes once, using collected items despite empty terminal output', () => {
  const h = harness();
  h.feed({ type: 'response.created', response: { id: 'response-1', output: [] } });
  h.feed(call()); h.feed(call());
  assert.equal(h.commands.length, 0);
  h.feed({ type: 'response.completed', response: { id: 'response-1', output: [] } });
  h.feed({ type: 'response.completed', response: { id: 'response-1', output: [] } });
  assert.deepEqual(h.commands, [{ type: 'show_correction', correctionId: 'correction-2' }]);
  assert.equal(h.sent[0].type, 'response.item.create');
  assert.equal(h.sent[1].type, 'response.create');
  assert.equal('delegation_id' in h.sent[1], false);
});
test('every result is sent before continuing a multiple-tool response', () => {
  const h = harness(); h.feed({ type: 'response.created', response: { id: 'response-1' } });
  h.feed(call()); h.feed(call('pause_video', '{}', 'call-2'));
  h.feed({ type: 'response.completed', response: { id: 'response-1', output: [] } });
  assert.deepEqual(h.sent.map(e => e.type), ['response.item.create', 'response.item.create', 'response.create']);
});
test('unknown corrections and out-of-clip actions return errors without executing', () => {
  const h = harness(); h.feed({ type: 'response.created', response: { id: 'response-1' } });
  h.feed(call('show_correction', '{"correctionId":"missing"}'));
  h.feed({ type: 'response.completed', response: { id: 'response-1', output: [] } });
  assert.equal(h.commands.length, 0);
  assert.match(JSON.stringify(h.sent[0]), /error/);
  assert.throws(() => commandFromCall('seek_video', '{"timestampSec":14}', context));
  assert.throws(() => commandFromCall('run_code', '{}', context));
});
test('unwrapped events and arguments-done events cannot execute functions', () => {
  const h = harness(); h.processor.handle(call());
  h.feed({ type: 'response.created', response: { id: 'response-1' } });
  h.feed({ type: 'response.function_call_arguments.done', name: 'show_correction', arguments: '{"correctionId":"correction-2"}' });
  h.feed({ type: 'response.completed', response: { id: 'response-1', output: [] } });
  assert.equal(h.commands.length, 0); assert.equal(h.sent.length, 0);
});
test('transcript deltas remain unchanged fragments, including overlapping speakers', () => {
  const h = harness();
  h.processor.handle({ type: 'session.input_transcript.delta', delta: 'Wait, ' });
  h.processor.handle({ type: 'session.output_transcript.delta', delta: ' your arm' });
  assert.deepEqual(h.transcripts, [{ role: 'user', text: 'Wait, ', final: false }, { role: 'coach', text: ' your arm', final: false }]);
});
test('stopping suppresses stale commands but still accepts finalization', () => {
  const h = harness(); h.feed({ type: 'response.created', response: { id: 'response-1' } }); h.feed(call());
  h.processor.stop(); h.feed({ type: 'response.completed', response: { id: 'response-1', output: [] } });
  h.processor.handle({ type: 'session.closed' });
  assert.equal(h.commands.length, 0); assert.equal(h.closed(), true);
});
