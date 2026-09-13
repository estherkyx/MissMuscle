import type { AnalysisReport } from '../../../shared/contracts';
import { exerciseCriteria } from '../../../shared/exercise-criteria';
import { videoFeedback } from '../../../shared/video-feedback';

const statuses = {
  looks_consistent: { icon: '✓', label: 'Looks consistent' },
  needs_attention: { icon: '!', label: 'Needs attention' },
  unclear: { icon: '–', label: 'Unclear' },
};

export function FormChecklist({ report, onSeek }: { report: AnalysisReport; onSeek?: (seconds: number) => void }) {
  return <div className="form-checklist" aria-label="AI form checklist">
    <p className="checklist-label">Form check <span>Based on what’s visible</span></p>
    {exerciseCriteria[report.exerciseId].map(criterion => {
      const check = report.visibility.assessable ? report.formChecks?.find(item => item.criterionId === criterion.id) : undefined;
      const status = check?.status ?? 'unclear';
      const display = statuses[status];
      return <details className={`form-check ${status}`} key={criterion.id}>
        <summary><span className="check-icon" aria-hidden="true">{display.icon}</span><span className="check-title"><strong>{criterion.title}</strong><span className="check-description">{criterion.expected}</span></span><span className="check-status">{display.label}</span><span className="check-chevron" aria-hidden="true">⌄</span></summary>
        <div className="check-detail"><p>{check ? videoFeedback(check.note, check.evidence) : report.visibility.assessable ? 'Not assessed in this report. Analyze your clip again to check this cue.' : 'This cue isn’t clear enough to assess in this video.'}</p>
          {!!check?.evidence.length && <div className="actions evidence-actions">{check.evidence.map(item => onSeek ? <button type="button" className="secondary" key={item.frameIndex} onClick={() => onSeek(item.timestampSec)}>Jump to {Number(item.timestampSec.toFixed(2))}s ↗</button> : <span className="muted" key={item.frameIndex}>{Number(item.timestampSec.toFixed(2))}s</span>)}</div>}
        </div>
      </details>;
    })}
  </div>;
}
