import { useState } from 'react';
import type { AnalysisReport } from '../shared/contracts';
import { getDemoReport } from './lib/api';

export default function App() {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadSample() {
    setLoading(true);
    setError('');
    try {
      const result = await getDemoReport();
      setReport(result);
      setSelected(result.corrections[0]?.id ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the sample.'); }
    finally { setLoading(false); }
  }

  const correction = report?.corrections.find(c => c.id === selected);
  return (
    <main>
      <header><a className="brand" href="/">MissMuscle<span>✳</span></a><span className="tag">Your movement, understood.</span></header>
      <section className="intro">
        <p className="eyebrow">A little guidance. A stronger next rep.</p>
        <h1>See your form.<br /><em>Find your focus.</em></h1>
        <p>Review a short exercise clip, see the moments that matter, and talk them through with your coach.</p>
      </section>
      <div className="workspace">
        <section className="panel">
          <p className="eyebrow">01 / Your movement</p><h2>Dumbbell curl</h2>
          <div className="video-placeholder"><span aria-hidden="true">↗</span><p>Your video review goes here</p><small>Clip upload and frame extraction are the next build step.</small></div>
          <p className="muted">Start with a short clip and a clear view of your working arm and torso.</p>
          <button onClick={loadSample} disabled={loading}>{loading ? 'Loading…' : 'Explore a sample report'}</button>
          {error && <p role="alert">{error}</p>}
        </section>
        <section className="panel" aria-live="polite">
          <p className="eyebrow">02 / Your next rep</p><h2>Make one thing clearer.</h2>
          {!report ? <p className="muted">Open the sample to preview correction cards. Exercise analysis and voice will be connected during development.</p> : <>
            <p className="sample-badge">Sample data · no video analysed</p>
            <p>{report.summary}</p>
            <div className="corrections">{report.corrections.map(c => <button className="correction" key={c.id} aria-pressed={selected === c.id} onClick={() => setSelected(c.id)}><span>{c.evidence[0].timestampSec.toFixed(1)}s</span>{c.title}</button>)}</div>
            {correction && <div className="detail"><p>{correction.observation}</p><strong>{correction.cue}</strong></div>}
            <p className="muted">Target muscle guide: {report.targetMuscles.join(' · ')}</p>
          </>}
          <div className="voice-placeholder"><span aria-hidden="true">◉</span><div><strong>Talk it through</strong><p>Voice coaching is the next build step.</p></div></div>
        </section>
      </div>
      <footer>MissMuscle · Visual Understanding + GPT-Live-1 · Development starter</footer>
    </main>
  );
}
