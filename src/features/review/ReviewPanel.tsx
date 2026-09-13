import type { AnalysisReport, Correction } from '../../../shared/contracts';
import { EXERCISES, type ExerciseReference } from './exercise-library';
import { FormDiagram, MuscleDiagram } from './ExerciseDiagrams';

export function ReferenceGuide({ exercise = EXERCISES[0] }: { exercise?: ExerciseReference }) {
  return <section className="reference-guide" aria-labelledby="reference-title">
    <span className="reference-number">01 / Technique</span><h3 id="reference-title">Target form</h3>
    <FormDiagram exercise={exercise.id} />
    <p className="muted">{exercise.summary}</p>
    <details><summary>Technique notes & sources</summary>
      <p>{exercise.label} · {exercise.variation}</p>
      {exercise.notes.map(note => <article className="criterion" key={note.title}><h4>{note.title}</h4><p>{note.text}</p></article>)}
      <div className="source-links">{exercise.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>
      <p className="muted">Educational schematic and source-based guidance, not a personalised ideal pose.</p>
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

export function MuscleGuide({ exercise = EXERCISES[0] }: { exercise?: ExerciseReference }) {
  const multiple = exercise.muscles.length > 1;
  return <section className="muscle-guide"><span className="reference-number">02 / Anatomy</span><h3>Target muscles</h3>
    {exercise.id === 'dumbbell_curl' ? <img className="reference-image" src="/target-muscles.svg" alt="Curl target map: red upper arms indicate primary targets, yellow forearms supporting muscles, and gray other areas." /> : multiple ? <div className="muscle-diagrams">{exercise.muscles.map(muscle => <figure key={muscle.id}><MuscleDiagram focus={muscle.id} compact /><figcaption>{muscle.label}</figcaption></figure>)}</div> : <MuscleDiagram focus={exercise.muscles[0].id} />}
    {exercise.muscles.map(muscle => <p className="muted" key={muscle.id}><strong>{muscle.label}.</strong> {muscle.description}</p>)}
    <p className="anatomy-note">An anatomy guide, not measured muscle activation.</p>
  </section>;
}
