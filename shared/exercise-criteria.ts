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
    { id: 'even_grip_pull', title: 'Even grip and pull', expected: 'Place hands evenly about the bar center and bring both sides down together.', deviation: 'Clearly unequal grip spacing, or repeated uneven hand travel with one side of the bar pulled lower.', visibility: 'Both hands and the bar visible in at least two moments, with bar center or matching grip landmarks identifiable. Account for perspective, camera roll and curved bar shape; do not compare raw screen heights alone.', cue: 'Match your hand positions on the bar and pull both sides down together.' },
    { id: 'controlled_return', title: 'Controlled return', expected: 'Let the arms lengthen overhead under control.', deviation: 'An abrupt return visible across closely spaced frames.', visibility: 'Closely spaced return frames; sparse sampling cannot establish control.', cue: 'Guide the bar back up smoothly.' },
  ],
  leg_extension: [
    { id: 'machine_alignment', title: 'Machine setup', expected: 'Follow the machine label; align the knee with its pivot and place the pad above the ankle.', deviation: 'Clearly misplaced pad or knee visibly offset from an identifiable machine pivot.', visibility: 'Side view with knee, ankle, pad and actual machine pivot visible. Do not infer a hidden pivot.', cue: 'Check the seat and pad setup against the machine instructions.' },
    { id: 'supported_torso', title: 'Stay supported', expected: 'Keep your back against the support and hips on the seat; hold the handles.', deviation: 'Repeated visible loss of back support or hips lifting from the seat during extension.', visibility: 'Seat, back pad, hips and torso visible across frames. Do not assume a gap when the contact area is hidden.', cue: 'Keep your back supported and hips on the seat as you extend.' },
    { id: 'full_extension', title: 'Full extension', expected: 'Straighten the knees fully at the top of the rep without forcing them beyond straight.', deviation: 'The knees remain clearly bent at the visible top of a repetition before the legs lower again.', visibility: 'Hip, knee and ankle visible from a comparable side view. A shortened-rep finding needs at least three ordered moments showing the lift, bent-knee top and return. A mid-rep image or an unseen top is insufficient; do not infer exact knee angles or joint locking.', cue: 'Finish straightening your legs under control before lowering, without forcing your knees past straight.' },
    { id: 'smooth_extension', title: 'Smooth extension', expected: 'Lift and lower smoothly without kicking or dropping the weight.', deviation: 'Abrupt kicking or return visible in closely spaced frames.', visibility: 'Hip, knee and ankle visible across closely spaced frames; do not diagnose joint locking from a still image.', cue: 'Straighten and return with control.' },
  ],
  dumbbell_front_squat: [
    { id: 'front_rack', title: 'Stable front rack', expected: 'Keep both dumbbells close to shoulder height as hips and knees bend together.', deviation: 'Dumbbells visibly fall forward away from the shoulders during descent.', visibility: 'Both weights, shoulders and torso visible across phases.', cue: 'Keep the weights close to your shoulders.' },
    { id: 'squat_depth', title: 'Squat depth', expected: 'For the full-rep reference, lower until the thighs are approximately parallel to the floor, within a range you can control.', deviation: 'The rep clearly reverses while the thighs remain well above the reference depth.', visibility: 'Hips, knees and floor orientation visible from a comparable side or front-side view. A shortened-rep finding needs at least three ordered moments showing descent, shallow bottom and ascent. Do not infer depth from one mid-rep frame or an exact knee angle; missing turnaround evidence is unclear.', cue: 'Work toward the reference depth while keeping your heels down and your movement controlled; do not force a deeper position.' },
    { id: 'squat_posture', title: 'Hips and chest together', expected: 'Keep your trunk controlled and let your hips and chest rise together.', deviation: 'A pronounced chest drop as the hips rise, or a clear loss of trunk position across the squat.', visibility: 'Torso and hips visible across at least two movement phases from a comparable view. Normal forward lean is not a fault; do not infer spinal joint angles, bracing or injury from a silhouette.', cue: 'Let your hips and chest rise together while keeping the weights close.' },
    { id: 'grounded_feet', title: 'Grounded feet', expected: 'Keep the feet grounded through descent and standing.', deviation: 'Clearly visible heel lift during the squat.', visibility: 'Feet and floor contact visible; do not infer pressure or balance from appearance.', cue: 'Use a depth where you can keep your feet grounded.' },
    { id: 'knee_tracking', title: 'Knee tracking', expected: 'Let knees follow the direction of the toes while hips and knees bend.', deviation: 'Pronounced repeated inward knee movement relative to the feet.', visibility: 'Both knees and feet visible from a front-side view; perspective must permit comparison.', cue: 'Let your knees follow your toes as you stand.' },
  ],
};
