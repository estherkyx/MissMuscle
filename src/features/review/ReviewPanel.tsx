import type { AnalysisReport, Correction } from '../../../shared/contracts';
import { curlReference, curlSources } from './curl-reference';

export function ReferenceGuide() {
  return <section className="reference-guide" aria-labelledby="reference-title">
    <span className="reference-number">01 / Technique</span><h3 id="reference-title">Target form</h3>
    <img className="reference-image" src="/curl-reference.svg" alt="Schematic curl: keep the torso and upper arm steady while bending at the elbow, then lower with control." />
    <p className="muted">Steady upper arm. Aligned wrist. Controlled movement.</p>
    <details><summary>Technique notes & sources</summary>
      <p>These criteria apply to a basic palms-up curl. Intentional forward-elbow curls and other variations need a different comparison.</p>
      {curlReference.criteria.map(criterion => <article className="criterion" key={criterion.id}>
        <h4>{criterion.title}</h4><p><strong>Aim for:</strong> {criterion.expected}</p>
        <p><strong>Look for:</strong> {criterion.deviation}</p><p className="muted"><strong>Evidence needed:</strong> {criterion.visibility}</p>
        <div className="source-links">{criterion.sources.map(source => <a key={source} href={curlSources[source].url} target="_blank" rel="noreferrer">{curlSources[source].title}</a>)}</div>
      </article>)}
      <p className="muted">Reference version {curlReference.version} · checked {curlReference.reviewedOn}. These are technique checks, not estimates of how common each fault is.</p>
    </details>
  </section>;
}

interface Props {
  report: AnalysisReport;
  correction: Correction | undefined;
  evidenceIndex: number;
  showKeyframe: boolean;
  hasVideo: boolean;
  onCorrection: (id: string) => void;
  onEvidence: (id: string, index: number) => void;
}

export function ReviewPanel({ report, correction, evidenceIndex, showKeyframe, hasVideo, onCorrection, onEvidence }: Props) {
  return <section aria-labelledby="findings-title">
    <div className="section-heading"><div><p className="eyebrow">Your next rep</p><h2 id="findings-title">Your corrections <span className="count-badge">{report.corrections.length}</span></h2></div><span className="muted">Tap a moment to review ↗</span></div>
    {report.source === 'fixture' && <p className="sample-badge">Fictional sample findings — not an assessment of this clip.</p>}
    {!report.visibility.assessable && <div className="visibility"><strong>A clearer view is needed</strong><ul>{report.visibility.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {!report.corrections.length && <p className="muted">{report.visibility.assessable ? 'No corrections were identified in the sampled frames. This does not assess every moment of the clip.' : 'Try recording again with your working arm and torso visible.'}</p>}
    <div className="corrections">{report.corrections.map((item, index) => <div className="correction-item" key={item.id}>
      <button className="correction" aria-pressed={correction?.id === item.id} onClick={() => onCorrection(item.id)}>
        <span className="timestamp"><span aria-hidden="true">▷</span> {item.evidence[0].timestampSec.toFixed(2)}s</span>
        <span className="correction-copy"><small>{item.priority === 'focus_first' ? 'Focus first' : `Adjustment ${index + 1}`}</small><strong>{item.title}</strong><span>{item.cue}</span></span>
        <span className="correction-arrow" aria-hidden="true">↗</span>
      </button>
      {correction?.id === item.id && <div className="detail"><p>{item.observation}</p><div className="actions evidence-actions"><span className="muted">{showKeyframe ? 'On screen ·' : 'Evidence ·'}</span>{item.evidence.map((evidence, i) => <button key={i} className="secondary" aria-pressed={evidenceIndex === i} onClick={() => onEvidence(item.id, i)}>{hasVideo ? 'Jump to' : 'Preview'} {evidence.timestampSec.toFixed(2)}s ↗</button>)}</div></div>}
    </div>)}</div>
    {!!report.corrections.length && <p className="next-focus"><span>Next attempt</span>{report.nextAttemptFocus}</p>}
    <details className="analysis-notes"><summary>Analysis notes</summary><p>{report.summary}</p>{report.visibility.assessable && !!report.visibility.limitations.length && <ul>{report.visibility.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>}{correction && <p><strong>Reference cue:</strong> {correction.referenceCue}</p>}</details>
  </section>;
}

export function MuscleGuide() {
  return <section className="muscle-guide"><span className="reference-number">02 / Your focus</span><h3>Target muscles</h3>
    <img className="reference-image" src="/target-muscles.svg" alt="Approximate upper-arm anatomy: biceps brachii at the front, with brachialis underneath." />
    <p className="muted">Primary focus: biceps. Brachialis assists elbow flexion. This is an anatomy guide, not measured muscle activation.</p>
    <a href={curlSources.anatomy.url} target="_blank" rel="noreferrer">Anatomy reference: OpenStax</a>
  </section>;
}
