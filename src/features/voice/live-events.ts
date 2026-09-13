import { InspectionQuestionSchema, LiveInspectionResultSchema, CoachCommandSchema, type CoachCommand, type CoachContext, type SessionCoachContext, type LiveInspectionResult } from '../../../shared/contracts';

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
type Call = { callId: string; name: string; arguments: string };
type Pending = { id: string; calls: Call[] };

export interface LiveEventHandlers {
  getContext(): SessionCoachContext;
  onInspect?: (question: string) => Promise<LiveInspectionResult>;
  onInspectionBusy?: (busy: boolean) => void;
  onCommand(command: CoachCommand): void;
  send(event: RecordValue): void;
  onTranscript(entry: { role: 'user' | 'coach'; text: string; final: boolean }): void;
  onStarted(): void;
  onClosed(): void;
  onError(message: string): void;
}

export function commandFromCall(name: string, args: string, context: CoachContext): CoachCommand {
  const value: unknown = JSON.parse(args);
  if (!object(value)) throw new Error('Tool arguments must be an object.');
  const command = CoachCommandSchema.parse({ ...object(value), type: name });
  if (command.type === 'show_correction' && !context.report.corrections.some(c => c.id === command.correctionId)) throw new Error('Unknown correction ID.');
  if (command.type === 'seek_video' && command.timestampSec > context.report.durationSec) throw new Error('Timestamp is outside the clip.');
  if (command.type === 'replay_segment' && command.endSec > context.report.durationSec) throw new Error('Segment is outside the clip.');
  return command;
}

// Handles documented Live envelopes; never infer tool calls from spoken text.
export function createLiveEventProcessor(handlers: LiveEventHandlers) {
  const pending = new Map<string, Pending>();
  const completedResponses = new Set<string>();
  const executedCalls = new Set<string>();
  const seenEvents = new Set<string>();
  let stopped = false;

  return {
    stop() { stopped = true; pending.clear(); },
    handle(value: unknown) {
      const event = object(value);
      if (!event || typeof event.type !== 'string') return;
      if (typeof event.event_id === 'string') {
        if (seenEvents.has(event.event_id)) return;
        seenEvents.add(event.event_id);
        // Bound memory during longer conversations.
        if (seenEvents.size > 5000) seenEvents.delete(seenEvents.values().next().value!);
      }
      if (event.type === 'session.closed') { handlers.onClosed(); return; }
      // Cancellation can begin while the HTTP handshake is still in flight.
      // Keep lifecycle events available so that late sessions can be closed.
      if (event.type === 'session.started') { handlers.onStarted(); return; }
      if (stopped) return;
      if (event.type === 'error') {
        handlers.onError('The voice service reported an error. End the session and reconnect.');
        return;
      }
      if (event.type === 'session.input_transcript.delta' || event.type === 'session.output_transcript.delta') {
        if (typeof event.delta === 'string') handlers.onTranscript({ role: event.type === 'session.input_transcript.delta' ? 'user' : 'coach', text: event.delta, final: false });
        // Deltas are fragments, not completed turns. Do not invent a final event.
        return;
      }
      if (event.type !== 'response.event' || typeof event.delegation_id !== 'string') return;
      const inner = object(event.event);
      if (!inner) return;
      const delegationId = event.delegation_id;
      const response = object(inner.response);
      if (inner.type === 'response.created' && typeof response?.id === 'string') {
        pending.set(delegationId, { id: response.id, calls: [] });
        return;
      }
      const run = pending.get(delegationId);
      if (!run) return;
      if (inner.type === 'response.output_item.done') {
        const item = object(inner.item);
        if (item?.type === 'function_call' && typeof item.call_id === 'string' && typeof item.name === 'string' && typeof item.arguments === 'string') {
          if (!run.calls.some(c => c.callId === item.call_id)) run.calls.push({ callId: item.call_id, name: item.name, arguments: item.arguments });
        }
        return;
      }
      if (inner.type === 'response.failed' || inner.type === 'response.incomplete') {
        pending.delete(delegationId);
        handlers.onError('The coach could not finish that request. Please ask again.');
        return;
      }
      if (inner.type !== 'response.completed' || response?.id !== run.id || completedResponses.has(run.id)) return;
      completedResponses.add(run.id);
      pending.delete(delegationId);
      if (!run.calls.length) return;
      if (run.calls.some(call => call.name === 'inspect_movement')) {
        handlers.onInspectionBusy?.(true);
        void (async () => {
          try {
            for (const call of run.calls) {
              if (stopped) return;
              let result: unknown;
              try {
                const context = handlers.getContext();
                if (!('mode' in context) || call.name !== 'inspect_movement' || !handlers.onInspect) throw new Error('Inspection unavailable');
                if (executedCalls.has(call.callId)) throw new Error('Duplicate inspection');
                executedCalls.add(call.callId);
                const { question } = InspectionQuestionSchema.parse(JSON.parse(call.arguments));
                const findings = LiveInspectionResultSchema.parse(await handlers.onInspect(question));
                const current = handlers.getContext();
                if (!('mode' in current) || current.sessionId !== findings.window.sessionId || current.exerciseId !== findings.report.exerciseId ||
                    current.elapsedSec - (findings.window.startSec + findings.report.durationSec) > 15) throw new Error('Findings are no longer current');
                result = { status: 'completed', findings };
              } catch { result = { status: 'error', message: 'A fresh visual assessment is unavailable. Explain the limitation; do not invent a correction.' }; }
              if (stopped) return;
              handlers.send({ type: 'response.item.create', event_id: crypto.randomUUID(), item: { type: 'function_call_output', call_id: call.callId, output: JSON.stringify(result) } });
            }
            if (!stopped) handlers.send({ type: 'response.create', event_id: crypto.randomUUID() });
          } finally { handlers.onInspectionBusy?.(false); }
        })();
        return;
      }
      // Lifecycle snapshots intentionally have output: []; use collected items.
      for (const call of run.calls) {
        let result: RecordValue;
        if (executedCalls.has(call.callId)) {
          result = { status: 'already_dispatched' };
        } else {
          executedCalls.add(call.callId);
          try {
            const context = handlers.getContext();
            if ('mode' in context) throw new Error('Playback unavailable during live exercise');
            const command = commandFromCall(call.name, call.arguments, context);
            handlers.onCommand(command);
            result = { status: 'dispatched', command, note: 'Sent to the playback handler; playback completion is not verified.' };
          } catch {
            result = { status: 'error', message: 'This action is invalid for the current clip or the playback handler rejected it. Ask for clarification.' };
          }
        }
        handlers.send({ type: 'response.item.create', event_id: crypto.randomUUID(), item: { type: 'function_call_output', call_id: call.callId, output: JSON.stringify(result) } });
      }
      handlers.send({ type: 'response.create', event_id: crypto.randomUUID() });
    },
  };
}
