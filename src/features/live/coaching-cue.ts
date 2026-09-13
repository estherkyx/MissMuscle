import { exerciseCriteria } from '../../../shared/exercise-criteria';
import type { LiveFinding } from './findings';
import type { LiveInspectionResult, ExerciseId } from '../../../shared/contracts';

export type CoachingCue = LiveFinding & { kind: 'correction' | 'nudge' | 'reassurance' };

export function coachingCueText(cue: CoachingCue, exerciseId: ExerciseId = 'dumbbell_curl', review?: LiveInspectionResult): string {
  const criterion=exerciseCriteria[exerciseId].find(c=>c.id===cue.criterionId);
  if(cue.kind==='nudge') return `Next-rep reminder, not a new observation: ${criterion?.cue??cue.note}`;
  if(cue.kind==='reassurance') {
    const qualification=review?.window.windowId===cue.windowId?squatDepthQualification(review):'';
    return `Encouraging feedback on the reviewed rep. Say what was good about ${criterion?.title??cue.criterionId}, without claiming the whole current pose is correct: ${cue.note}${qualification}`;
  }
  return `Correction from the reviewed rep, with a next-rep action: ${cue.note} ${criterion?.cue??''}`;
}

function squatDepthQualification(result: LiveInspectionResult): string {
  if(result.report.exerciseId!=='dumbbell_front_squat')return '';
  const depth=result.report.formChecks?.find(check=>check.criterionId==='squat_depth');
  if(!depth || depth.status==='unclear')return ' Also say squat depth was not confirmed; do not describe the whole squat as good form.';
  if(depth.status==='needs_attention')return ` Keep the depth correction explicit alongside praise for the other aspect: ${depth.note}`;
  return '';
}

export function reviewSpeech(result: LiveInspectionResult): string {
  const correction=result.report.formChecks?.find(check=>check.status==='needs_attention');
  if(correction) return `Delayed review of an earlier rep, not the current pose. Say that this came from an earlier rep and give the next-rep action: ${correction.note}`;
  if(!result.report.visibility.assessable || !result.report.formChecks?.some(check=>check.status==='looks_consistent')) {
    return `Assessment limitation, not good-form feedback. Briefly explain what could not be assessed: ${result.report.summary}`;
  }
  return `Delayed review of an earlier rep, not the current pose. Explicitly say "In the earlier rep" and briefly describe only the supported finding: ${result.report.formChecks.find(check=>check.status==='looks_consistent')!.note}${squatDepthQualification(result)}`;
}
