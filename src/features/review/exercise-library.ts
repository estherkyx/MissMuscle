import { curlReference, curlSources } from '../../../shared/curl-reference';

// UI/reference catalogue only. New IDs are deliberately NOT added to AnalysisRequest.
export type ExerciseId = 'dumbbell_curl' | 'lat_pulldown' | 'leg_extension' | 'dumbbell_front_squat';
export type MuscleId = 'biceps' | 'lats' | 'quadriceps' | 'glutes';
export interface ExerciseReference {
  id: ExerciseId;
  label: string;
  shortLabel: string;
  variation: string;
  analysisAvailable: boolean;
  muscles: { id: MuscleId; label: string; description: string }[];
  summary: string;
  camera: string;
  notes: { title: string; text: string }[];
  sources: { title: string; url: string }[];
}

export const EXERCISES: ExerciseReference[] = [
  {
    id: 'dumbbell_curl', label: 'Dumbbell curl', shortLabel: 'Standing curl', variation: 'Standing · palms-up curl', analysisAvailable: true,
    muscles: [{ id: 'biceps', label: 'Biceps', description: 'Biceps bend the elbow, with help from the brachialis. Keep the wrist aligned as you curl.' }],
    summary: 'Steady upper arm. Aligned wrist. Controlled movement.', camera: curlReference.camera,
    notes: curlReference.criteria.map(c => ({ title: c.title, text: c.expected })), sources: Object.values(curlSources),
  },
  {
    id: 'lat_pulldown', label: 'Lat pulldown', shortLabel: 'Lat pulldown', variation: 'Seated · overhand grip', analysisAvailable: false,
    muscles: [{ id: 'lats', label: 'Lats', description: 'The latissimus dorsi helps bring the upper arms down toward your sides. The biceps and upper-back muscles assist.' }],
    summary: 'Stable torso. Elbows down. A controlled return.',
    camera: 'Use a front-side view that includes the bar, shoulders, elbows and seated torso.',
    notes: [
      { title: 'Set up the seat', text: 'Secure your thighs under the pad and take an overhand grip. Keep your trunk steady with a small, comfortable backward lean.' },
      { title: 'Pull in front', text: 'Guide the bar toward your upper chest as your elbows move down beside you. Avoid swinging your torso to move the load.' },
      { title: 'Return smoothly', text: 'Let your arms lengthen overhead under control. This reference uses a front pulldown, not a behind-the-neck variation.' },
    ],
    sources: [
      { title: 'ACE · Seated lat pulldown', url: 'https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/' },
      { title: 'NASM · Pulldown muscles & grips', url: 'https://www.nasm.org/resource-center/blog/training/the-biomechanics-of-the-lat-pulldown-muscles-grip-and-form' },
    ],
  },
  {
    id: 'leg_extension', label: 'Leg extension', shortLabel: 'Leg extension', variation: 'Seated · leg-extension machine', analysisAvailable: false,
    muscles: [{ id: 'quadriceps', label: 'Quadriceps', description: 'The quadriceps at the front of the thigh straighten the knee. This reference targets the group as a whole.' }],
    summary: 'Align the knee. Extend smoothly. Lower with control.',
    camera: 'Use a side view that shows the seat, hip, knee and lower-leg pad.',
    notes: [
      { title: 'Adjust the machine', text: 'Follow the machine’s setup label. Adjust the seat so your knee aligns with its pivot and the lower-leg pad rests above your ankle.' },
      { title: 'Keep your seat', text: 'Keep your back supported and hold the handles as you straighten your knees. Avoid lifting your hips or kicking the weight.' },
      { title: 'Control both directions', text: 'Extend toward a comfortable straight position without forcefully locking the knees, then lower steadily. Machine designs and available range vary.' },
    ],
    sources: [{ title: 'Life Fitness · Leg-extension setup (p. 17)', url: 'https://www.lifefitness.com.au/wp-content/uploads/2015/02/Optima_user_manual_for_all_strength_2_585_1371787541.pdf#page=18' }],
  },
  {
    id: 'dumbbell_front_squat', label: 'Dumbbell front squat', shortLabel: 'Front squat', variation: 'Two dumbbells · shoulder height', analysisAvailable: false,
    muscles: [
      { id: 'quadriceps', label: 'Quadriceps', description: 'The quadriceps straighten your knees as you stand.' },
      { id: 'glutes', label: 'Glutes', description: 'The gluteus maximus helps extend your hips as you stand.' },
    ],
    summary: 'Weights close. Feet grounded. Stand with control.',
    camera: 'Use a front-side view that includes the dumbbells, torso, knees and both feet.',
    notes: [
      { title: 'Hold the front rack', text: 'Support a dumbbell at each shoulder, with elbows forward and your trunk braced.' },
      { title: 'Lower together', text: 'Bend your hips and knees together. Keep your feet grounded and knees following the direction of your toes, using a depth you can control.' },
      { title: 'Stand tall', text: 'Push through your feet to straighten your hips and knees. Keep the weights close rather than letting them pull your torso forward.' },
    ],
    sources: [{ title: 'NASM · Dumbbell front squat', url: 'https://www.nasm.org/resource-center/exercise-library/dumbbell-front-squat' }],
  },
];

export const getExercise = (id: string) => EXERCISES.find(exercise => exercise.id === id);
export const canAnalyzeExercise = (exerciseId: string) => exerciseId === 'dumbbell_curl';
