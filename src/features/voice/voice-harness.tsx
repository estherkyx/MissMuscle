// Development-only standalone page. Does not modify Person A's App.tsx.
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { AnalysisReportSchema, type CoachCommand } from '../../../shared/contracts';
import { demoReport } from '../../../shared/fixtures/demo-report';
import { connectCoach, type CoachConnection, type CoachStatus } from './coach-client';

function VoiceHarness() {
  const [report, setReport] = useState(demoReport);
  const [selected, setSelected] = useState<string | null>(demoReport.corrections[0]?.id ?? null);
  const [time, setTime] = useState(0);
  const [status, setStatus] = useState<CoachStatus>('idle');
  const [error, setError] = useState('');
  const [captions, setCaptions] = useState({ user: '', coach: '' });
  const [commands, setCommands] = useState<CoachCommand[]>([]);
  const connection = useRef<CoachConnection | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
    controller.current?.abort();
    void connection.current?.disconnect().catch(() => {});
  }, []);
  useEffect(() => {
    connection.current?.updateContext({ report, currentTimeSec: time, selectedCorrectionId: selected });
  }, [report, time, selected]);

  async function start() {
    setBusy(true); setError(''); setCaptions({ user: '', coach: '' }); setCommands([]);
    const abort = new AbortController(); controller.current = abort;
    try {
      const result = await connectCoach({
        context: { report, currentTimeSec: time, selectedCorrectionId: selected },
        signal: abort.signal,
        onStatus: next => { if (mounted.current) setStatus(next); },
        onError: message => { if (mounted.current) setError(message); },
        onTranscript: ({ role, text }) => setCaptions(old => ({ ...old, [role]: old[role] + text })),
        onCommand: command => {
          setCommands(old => [...old, command]);
          if (command.type === 'show_correction') {
            setSelected(command.correctionId);
            setTime(report.corrections.find(c => c.id === command.correctionId)!.evidence[0].timestampSec);
          } else if (command.type === 'seek_video') setTime(command.timestampSec);
          else if (command.type === 'replay_segment') setTime(command.startSec);
        },
      });
      if (abort.signal.aborted || !mounted.current) await result.disconnect();
      else connection.current = result;
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Could not connect.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function stop() {
    setBusy(true);
    try {
      if (connection.current) await connection.current.disconnect(); else controller.current?.abort();
    } catch (e) { setError(e instanceof Error ? e.message : 'Session finalization failed.'); }
    finally { connection.current = null; setBusy(false); }
  }
  const active = status === 'connecting' || status === 'listening' || status === 'speaking';
  return <main style={{ maxWidth: 850, margin: '40px auto', padding: 24, font: '16px/1.6 system-ui', color: '#183b2a' }}>
    <h1>MissMuscle · Voice integration test</h1>
    <p><strong>Development harness.</strong> Voice uses the real GPT-Live API. Playback below is simulated state, not a video player.</p>
    <p>Report source: <strong>{report.source === 'fixture' ? 'fictional sample' : 'imported Astra analysis'}</strong>. {report.summary}</p>
    <label>Import an analysis report JSON: <input disabled={active || busy} type="file" accept="application/json,.json" onChange={async event => {
      try {
        const file = event.target.files?.[0]; if (!file) return;
        const parsed = AnalysisReportSchema.parse(JSON.parse(await file.text()));
        setReport(parsed); setTime(0); setSelected(parsed.corrections[0]?.id ?? null); setError('');
      } catch { setError('That file is not a valid AnalysisReport JSON.'); }
    }} /></label>
    <p><button disabled={active || busy} onClick={start}>Start real voice</button>{' '}<button disabled={!active && !busy} onClick={stop}>End / cancel voice</button></p>
    <p aria-live="polite">Connection: <strong>{status}</strong></p>
    {error && <p role="alert" style={{ color: '#a12424' }}>{error}</p>}
    <p>Try: “Explain the first correction.” Then interrupt: “Wait, show me the second correction.”</p>
    <label>Current clip time <input type="range" min="0" max={report.durationSec} step="0.1" value={time} onChange={e => setTime(Number(e.target.value))} /> {time.toFixed(1)}s</label>
    <ul>{report.corrections.map(c => <li key={c.id}><button aria-pressed={selected === c.id} onClick={() => { setSelected(c.id); setTime(c.evidence[0].timestampSec); }}>{selected === c.id ? '→ ' : ''}{c.title}</button></li>)}</ul>
    <h2>Received playback commands</h2><pre style={{ whiteSpace: 'pre-wrap' }}>{commands.map(c => JSON.stringify(c)).join('\n') || 'No command received yet.'}</pre>
    <h2>Transcript fragments</h2><p><strong>You:</strong> {captions.user}</p><p><strong>Coach:</strong> {captions.coach}</p>
    <p>Captions accumulate fragments; they are not authoritative completed turns. Press End and confirm the microphone indicator goes away.</p>
  </main>;
}

createRoot(document.getElementById('voice-test')!).render(<VoiceHarness />);
