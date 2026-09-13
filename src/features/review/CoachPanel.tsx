import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { CoachCommand, CoachContext } from '../../../shared/contracts';
import { connectCoach, type CoachStatus } from '../voice/coach-client';
import { createCoachSession } from './coach-session';
import { appendTranscript, type TranscriptFragment } from './transcript';

export interface CoachPanelHandle { stop(): Promise<void> }
interface Props {
  ref: Ref<CoachPanelHandle>;
  context: CoachContext | null;
  onCommand: (command: CoachCommand) => void;
}

export function CoachPanel({ ref, context, onCommand }: Props) {
  const session = useRef<ReturnType<typeof createCoachSession> | null>(null);
  if (!session.current) session.current = createCoachSession(connectCoach);
  const mounted = useRef(false);
  const uiEpoch = useRef(0);
  const latest = useRef({ context, onCommand });
  latest.current = { context, onCommand };
  const [status, setStatus] = useState<CoachStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState<TranscriptFragment[]>([]);

  async function stop() {
    uiEpoch.current++;
    let ended = false;
    if (mounted.current) setBusy(true);
    try { await session.current!.stop(); ended = true; }
    catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Could not finish ending the coach session.');
      throw e;
    } finally {
      if (mounted.current) { setStatus(ended ? 'idle' : 'error'); setActive(!ended); setBusy(false); }
    }
  }
  useImperativeHandle(ref, () => ({ stop }));
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; uiEpoch.current++; void session.current!.stop().catch(() => {}); };
  }, []);
  useEffect(() => {
    if (!context) return;
    try { session.current!.updateContext(context); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update the coach context.'); }
  }, [context]);

  async function start() {
    if (!latest.current.context || busy || active) return;
    const generation = ++uiEpoch.current;
    setBusy(true); setStatus('connecting'); setError(''); setTranscript([]);
    try {
      await session.current!.start({
        context: latest.current.context,
        onCommand: command => latest.current.onCommand(command),
        onStatus: next => {
          setStatus(next);
          if (next === 'idle' || next === 'error') setActive(false);
        },
        onError: setError,
        onTranscript: entry => setTranscript(previous => appendTranscript(previous, entry)),
      });
      if (mounted.current && generation === uiEpoch.current) setActive(true);
    } catch (e) {
      if (mounted.current && generation === uiEpoch.current) { setError(e instanceof Error ? e.message : 'Could not connect the coach.'); setStatus('error'); }
    } finally { if (mounted.current && generation === uiEpoch.current) setBusy(false); }
  }

  return <section className="coach-panel" aria-labelledby="coach-title">
    <div className="section-heading"><h3 id="coach-title">Talk it through</h3><span className="status" role="status">{busy && status !== 'connecting' ? 'Ending…' : status}</span></div>
    <p className="muted">Ask “Show me where you noticed that.” The coach uses your current report and playback position.</p>
    {context?.report.source === 'fixture' && <p className="sample-badge">Voice discussion would use fictional sample findings.</p>}
    <div className="actions">
      <button onClick={() => void start()} disabled={!context || busy || active}>Start voice coach</button>
      <button className="secondary" onClick={() => { void stop().catch(() => {}); }} disabled={!active && status !== 'connecting'}>End session</button>
    </div>
    {!context && <p className="muted">Load a clip and a report to start voice coaching.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <div className="transcript" role="log" aria-label="Coach conversation" aria-live="polite">
      {transcript.map((entry, index) => <p key={index}><strong>{entry.role === 'user' ? 'You' : 'Coach'}:</strong> {entry.text}</p>)}
    </div>
  </section>;
}
