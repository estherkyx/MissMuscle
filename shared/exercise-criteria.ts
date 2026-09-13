import type { ExerciseId } from './contracts';
import { curlReference } from './curl-reference';

export interface ExerciseCriterion {
  id: string;
  title: string;
  expected: string;
  deviation: string;
  visibility: string;
  cue: string;
}

// Source review: 2026-09-13. Source URLs live with each shared exercise.
// These are conservative visual comparisons, not clinically validated rules.
export const exerciseCriteria: Record<ExerciseId, readonly ExerciseCriterion[]> = {
  dumbbell_curl: curlReference.criteria,
  lat_pulldown: [
    { id: 'stable_torso', title: 'Stable torso', expected: 'Maintain a comfortable small lean throughout the pull.', deviation: 'Repeated large backward torso swing during pulling.', visibility: 'Shoulders and hips visible across pulling and return frames.', cue: 'Keep your torso quieter as you pull.' },
    { id: 'front_pull', title: 'Pull in front', expected: 'Bring the bar toward the upper chest as elbows move down beside the torso.', deviation: 'Elbows continue travelling backward after their downward movement stops.', visibility: 'Bar, shoulders and elbows visible from a front-side view in multiple phases.', cue: 'Think elbows down; stop before pulling them behind you.' },
    { id: 'controlled_return', title: 'Controlled return', expected: 'Let the arms lengthen overhead under control.', deviation: 'An abrupt return visible across closely spaced frames.', visibility: 'Closely spaced return frames; sparse sampling cannot establish control.', cue: 'Guide the bar back up smoothly.' },
  ],
  leg_extension: [
    { id: 'machine_alignment', title: 'Machine setup', expected: 'Follow the machine label; align the knee with its pivot and place the pad above the ankle.', deviation: 'Clearly misplaced pad or knee visibly offset from an identifiable machine pivot.', visibility: 'Side view with knee, ankle, pad and actual machine pivot visible. Do not infer a hidden pivot.', cue: 'Check the seat and pad setup against the machine instructions.' },
    { id: 'supported_torso', title: 'Stay supported', expected: 'Keep the back supported and hold the seat handles.', deviation: 'Repeated visible loss of back support during extension.', visibility: 'Seat, back pad and torso visible across frames.', cue: 'Keep your back supported as you extend.' },
    { id: 'smooth_extension', title: 'Smooth extension', expected: 'Extend toward a comfortable straight position and return smoothly without forcing the knees.', deviation: 'Abrupt kicking or return visible in closely spaced frames.', visibility: 'Hip, knee and ankle visible across closely spaced frames; do not diagnose joint locking from a still image.', cue: 'Straighten and return with control.' },
  ],
  dumbbell_front_squat: [
    { id: 'front_rack', title: 'Stable front rack', expected: 'Keep both dumbbells close to shoulder height as hips and knees bend together.', deviation: 'Dumbbells visibly fall forward away from the shoulders during descent.', visibility: 'Both weights, shoulders and torso visible across phases.', cue: 'Keep the weights close to your shoulders.' },
    { id: 'grounded_feet', title: 'Grounded feet', expected: 'Keep the feet grounded through descent and standing.', deviation: 'Clearly visible heel lift during the squat.', visibility: 'Feet and floor contact visible; do not infer pressure or balance from appearance.', cue: 'Use a depth where you can keep your feet grounded.' },
    { id: 'knee_tracking', title: 'Knee tracking', expected: 'Let knees follow the direction of the toes while hips and knees bend.', deviation: 'Pronounced repeated inward knee movement relative to the feet.', visibility: 'Both knees and feet visible from a front-side view; perspective must permit comparison.', cue: 'Let your knees follow your toes as you stand.' },
  ],
};
