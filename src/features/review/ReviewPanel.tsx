import type { AnalysisReport, Correction } from '../../../shared/contracts';
import { EXERCISES, type ExerciseReference } from './exercise-library';
import { FormDiagram, MuscleDiagram } from './ExerciseDiagrams';
import { FormChecklist } from './FormChecklist';
import { videoFeedback } from '../../../shared/video-feedback';

export function ReferenceGuide({ exercise = EXERCISES[0] }: { exercise?: ExerciseReference }) {
  return <section className="reference-guide">
    <p className="reference-variation">{exercise.variation}</p>
    <div className="reference-visuals"><FormDiagram exercise={exercise.id} /><div className="reference-anatomy">{exercise.muscles.map(muscle => <MuscleDiagram key={muscle.id} focus={muscle.id} compact />)}</div></div>
    <p>{exercise.summary}</p>
    <div className="reference-muscles">{exercise.muscles.map(muscle => <p key={muscle.id}><strong>{muscle.label}.</strong> {muscle.description}</p>)}</div>
    <h3>Technique & best practices</h3>
    <ul className="technique-list">{exercise.notes.map(note => <li key={note.title}><strong>{note.title}</strong><p>{note.text}</p></li>)}</ul>
    <h3>Watch & learn more</h3>
    <div className="reference-resources">{exercise.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</div>
    <p className="anatomy-note">Educational guidance. Muscle highlights show anatomy, not measured activation.</p>
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
  onSeek?: (seconds: number) => void;
}

export function ReviewPanel({ report, correction, evidenceIndex, showKeyframe, hasVideo, onCorrection, onEvidence, onSeek }: Props) {
  const evidence = [...report.corrections, ...(report.formChecks ?? [])].flatMap(item => item.evidence);
  return <section aria-labelledby="findings-title">
    <div className="section-heading"><h2 id="findings-title">Analysis</h2></div>
    {report.source === 'fixture' && <p className="sample-badge">Fictional sample findings — not an assessment of this clip.</p>}
    {!report.visibility.assessable && <div className="visibility"><strong>Unable to assess this video</strong><ul>{report.visibility.limitations.map((item, index) => <li key={index}>{videoFeedback(item, evidence)}</li>)}</ul></div>}
    {!report.corrections.length && <p className="muted">{report.visibility.assessable ? 'No corrections identified. This does not assess every moment of the clip.' : 'The available video does not support a form assessment.'}</p>}
    <div className="corrections">{report.corrections.map((item, index) => <div className="correction-item" key={item.id}>
      <button className="correction" aria-expanded={correction?.id === item.id} aria-controls={`detail-${item.id}`} onClick={() => onCorrection(item.id)}>
        <span className="timestamp">{item.evidence[0].timestampSec.toFixed(2)}s</span>
        <span className="correction-copy"><small>{item.priority === 'focus_first' ? 'Focus first' : `Adjustment ${index + 1}`}</small><strong>{videoFeedback(item.title, item.evidence)}</strong><span>{videoFeedback(item.cue, item.evidence)}</span></span>
        <span className="correction-arrow" aria-hidden="true">⌄</span>
      </button>
      {correction?.id === item.id && <div className="detail" id={`detail-${item.id}`}><p>{videoFeedback(item.observation, item.evidence)}</p><div className="actions evidence-actions"><span className="muted">{showKeyframe ? 'On screen ·' : 'Evidence ·'}</span>{item.evidence.map((evidence, i) => <button key={i} className="secondary" aria-pressed={evidenceIndex === i} onClick={() => onEvidence(item.id, i)}>{hasVideo ? 'Jump to' : 'Preview'} {evidence.timestampSec.toFixed(2)}s ↗</button>)}</div></div>}
    </div>)}</div>
    {!!report.corrections.length && <p className="next-focus"><span>Next attempt</span>{videoFeedback(report.nextAttemptFocus, evidence)}</p>}
    <FormChecklist report={report} onSeek={hasVideo ? onSeek : undefined} />
  </section>;
}

export function MuscleGuide({ exercise = EXERCISES[0] }: { exercise?: ExerciseReference }) {
  const multiple = exercise.muscles.length > 1;
  return <section className="muscle-guide"><span className="reference-number">02 / Anatomy</span><h3>Target muscles</h3>
    {multiple ? <div className="muscle-diagrams">{exercise.muscles.map(muscle => <figure key={muscle.id}><MuscleDiagram focus={muscle.id} compact /><figcaption>{muscle.label}</figcaption></figure>)}</div> : <MuscleDiagram focus={exercise.muscles[0].id} />}
    {exercise.muscles.map(muscle => <p className="muted" key={muscle.id}><strong>{muscle.label}.</strong> {muscle.description}</p>)}
    <p className="anatomy-note">An anatomy guide, not measured muscle activation.</p>
  </section>;
}
