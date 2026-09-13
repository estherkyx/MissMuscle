import type { AnalysisReport, AnalysisRequest, Correction } from '../../../shared/contracts';
import { regionStyle } from '../video/playback';
import { curlReference, curlSources } from './curl-reference';

export function ReferenceGuide() {
  return <section className="reference-guide" aria-labelledby="reference-title">
    <p className="eyebrow">The comparison standard</p><h3 id="reference-title">{curlReference.variant}</h3>
    <img className="reference-image" src="/curl-reference.svg" alt="Schematic curl: keep the torso and upper arm steady while bending at the elbow, then lower with control." />
    <p className="muted">Educational reference · source-checked schematic, not a reconstructed ideal pose.</p>
    <details><summary>Correct form &amp; faults to look for</summary>
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
  request: AnalysisRequest | null;
  showKeyframe: boolean;
  hasVideo: boolean;
  onCorrection: (id: string) => void;
  onEvidence: (id: string, index: number) => void;
}

export function ReviewPanel({ report, correction, evidenceIndex, request, showKeyframe, hasVideo, onCorrection, onEvidence }: Props) {
  const evidence = correction?.evidence[evidenceIndex];
  const frame = report.source === 'astra' && request?.clipId === report.clipId && evidence ? request.frames[evidence.frameIndex] : null;
  return <section aria-labelledby="findings-title">
    <p className="eyebrow">02 / Your next rep</p><h2 id="findings-title">Make one thing clearer.</h2>
    {report.source === 'fixture' && <p className="sample-badge">Fictional sample findings — not an assessment of this clip.</p>}
    <p>{report.summary}</p>
    <p className="muted">Target muscles: {report.targetMuscles.join(' · ')}</p>
    {!!report.visibility.limitations.length && <div className="visibility"><strong>{report.visibility.assessable ? 'What the review can see' : 'A clearer view is needed'}</strong><ul>{report.visibility.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {!report.corrections.length && <p>{report.visibility.assessable ? 'No corrections were identified in the sampled frames. This does not assess every moment of the clip.' : 'No form corrections can be supported from this view. Record again with your working arm and torso visible.'}</p>}
    <div className="corrections">{report.corrections.map(item => <button className="correction" key={item.id} aria-pressed={correction?.id === item.id} onClick={() => onCorrection(item.id)}><span>{item.evidence[0].timestampSec.toFixed(2)}s</span><span><small>{item.priority === 'focus_first' ? 'Focus first' : 'Practise next'}</small>{item.title}</span></button>)}</div>
    {correction && <div className="detail">
      <p>{correction.observation}</p><p><strong>{correction.cue}</strong></p>
      <div className="actions evidence-actions">{correction.evidence.map((item, index) => <button key={index} className="secondary" aria-pressed={evidenceIndex === index} onClick={() => onEvidence(correction.id, index)}>{hasVideo ? 'Show' : 'Preview'} {item.timestampSec.toFixed(2)}s</button>)}</div>
      {frame && showKeyframe && evidence && <figure className="evidence-figure">
        <div className="evidence-image"><img src={frame.dataUrl} width={frame.width} height={frame.height} alt={`Submitted evidence for ${correction.title} at ${frame.timestampSec.toFixed(2)} seconds`} />
          {evidence.region && <span className="region" style={regionStyle(evidence.region)} aria-label="Approximate region referenced by the correction" />}
        </div><figcaption>Your evidence · submitted frame {evidence.frameIndex + 1} · {frame.timestampSec.toFixed(2)}s{evidence.region && ' · approximate highlight'}</figcaption>
      </figure>}
      {report.source === 'fixture' && <p className="muted">Sample timestamps illustrate playback only. No submitted evidence image or real localization exists for these fictional findings.</p>}
      <p><strong>Reference guidance:</strong> {report.source === 'fixture' ? 'Keep the upper arm and torso steady, with the wrist aligned. See the educational reference below.' : correction.referenceCue}</p>
    </div>}
    <p className="next-focus"><strong>Next attempt</strong><br />{report.nextAttemptFocus}</p>
  </section>;
}

export function MuscleGuide() {
  return <section className="muscle-guide"><h3>Target muscles</h3>
    <img className="reference-image" src="/target-muscles.svg" alt="Curl target map: red upper arms indicate the primary target area, yellow forearms indicate supporting muscles, and gray shows other areas." />
    <p className="muted">Biceps brachii and brachialis help bend the elbow. This educational diagram does not measure muscle activation from your video.</p>
    <a href={curlSources.anatomy.url} target="_blank" rel="noreferrer">Anatomy reference: OpenStax</a>
  </section>;
}
