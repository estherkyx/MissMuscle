import type { CoachContext } from '../../../shared/contracts';
import type { CoachConnection, CoachOptions } from '../voice/coach-client';

// Serializes adapter setup/teardown without depending on any provider wire events.
export function createCoachSession(connect: (options: CoachOptions) => Promise<CoachConnection>) {
  let epoch = 0;
  let connection: CoachConnection | null = null;
  let pending: Promise<void> | null = null;
  let stopping: Promise<void> | null = null;
  let context: CoachContext | null = null;
  let controller: AbortController | null = null;

  function start(options: CoachOptions): Promise<void> {
    if (pending || connection || stopping) return pending ?? stopping ?? Promise.resolve();
    const generation = ++epoch;
    controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    context = options.context;
    const active = () => epoch === generation;
    let setupError: unknown;
    pending = (async () => {
      let result: CoachConnection;
      try { result = await connect({
        context: options.context,
        signal,
        onCommand: command => { if (active()) options.onCommand(command); },
        onStatus: status => {
          if (!active()) return;
          if (!pending && (status === 'idle' || status === 'error')) connection = null;
          options.onStatus(status);
        },
        onError: message => { if (active()) options.onError?.(message); },
        onTranscript: entry => { if (active()) options.onTranscript(entry); },
      }); } catch (error) { if (active()) epoch++; setupError = error; return; }
      if (!active()) { await result.disconnect(); return; }
      connection = result;
      try { if (context) result.updateContext(context); }
      catch (error) { epoch++; await result.disconnect(); connection = null; throw error; }
    })().finally(() => { pending = null; });
    return pending.then(() => { if (setupError !== undefined) throw setupError; });
  }

  function stop(): Promise<void> {
    if (stopping) return stopping;
    epoch++;
    if (pending) controller?.abort();
    const old = connection;
    // A late setup must disconnect itself before a replacement can start.
    stopping = (async () => {
      if (old) { await old.disconnect(); if (connection === old) connection = null; }
      if (pending) await pending;
    })().finally(() => { stopping = null; });
    return stopping;
  }

  return { start, stop, updateContext(next: CoachContext) { context = next; connection?.updateContext(next); } };
}
