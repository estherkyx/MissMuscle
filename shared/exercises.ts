import { exerciseCriteria, type ExerciseCriterion } from './exercise-criteria';
import { curlReference, curlSources } from './curl-reference';

import { ExerciseIdSchema, type ExerciseId } from './contracts';
export type { ExerciseId } from './contracts';

export type MuscleId = 'biceps' | 'lats' | 'quadriceps' | 'glutes';
export interface ExerciseReference {
  id: ExerciseId;
  label: string;
  shortLabel: string;
  variation: string;
  analysisAvailable: boolean;
  version: string;
  criteria: readonly ExerciseCriterion[];
  targetMuscles: string[];
  muscles: { id: MuscleId; label: string; description: string }[];
  summary: string;
  camera: string;
  notes: { title: string; text: string }[];
  sources: { title: string; url: string }[];
}

const catalogue: Omit<ExerciseReference, 'version' | 'criteria' | 'targetMuscles' | 'notes'>[] = [
  {
    id: 'dumbbell_curl', label: 'Dumbbell curl', shortLabel: 'Standing curl', variation: 'Standing · palms-up curl', analysisAvailable: true,
    muscles: [{ id: 'biceps', label: 'Biceps', description: 'Biceps bend the elbow, with help from the brachialis. Keep the wrist aligned as you curl.' }],
    summary: 'Steady upper arm. Aligned wrist. Controlled movement.', camera: curlReference.camera,
    sources: Object.values(curlSources),
  },
  {
    id: 'lat_pulldown', label: 'Lat pulldown', shortLabel: 'Lat pulldown', variation: 'Seated · overhand grip', analysisAvailable: true,
    muscles: [{ id: 'lats', label: 'Lats', description: 'The latissimus dorsi helps bring the upper arms down toward your sides. The biceps and upper-back muscles assist.' }],
    summary: 'Stable torso. Elbows down. A controlled return.',
    camera: 'Use a front-side view that includes the bar, shoulders, elbows and seated torso.',
    sources: [
      { title: 'PureGym · Lat pulldown guide and demonstration', url: 'https://www.puregym.com/exercises/back/lat-exercises/lat-pulldown/' },
      { title: 'ACE · Seated lat pulldown', url: 'https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/' },
      { title: 'NSCA · Strength and conditioning basics', url: 'https://www.nsca.com/contentassets/116c55d64e1343d2b264e05aaf158a91/basics_of_strength_and_conditioning_manual.pdf' },
      { title: 'NASM · Pulldown muscles & grips', url: 'https://www.nasm.org/resource-center/blog/training/the-biomechanics-of-the-lat-pulldown-muscles-grip-and-form' },
    ],
  },
  {
    id: 'leg_extension', label: 'Leg extension', shortLabel: 'Leg extension', variation: 'Seated · leg-extension machine', analysisAvailable: true,
    muscles: [{ id: 'quadriceps', label: 'Quadriceps', description: 'The quadriceps at the front of the thigh straighten the knee. This reference targets the group as a whole.' }],
    summary: 'Align the knee. Extend smoothly. Lower with control.',
    camera: 'Use a side view that shows the seat, hip, knee and lower-leg pad.',
    sources: [{ title: 'PureGym · Leg-extension guide and demonstration', url: 'https://www.puregym.com/exercises/legs/quad-exercises/leg-extensions/' }, { title: 'Life Fitness · Leg-extension setup (p. 17)', url: 'https://www.lifefitness.com.au/wp-content/uploads/2015/02/Optima_user_manual_for_all_strength_2_585_1371787541.pdf#page=18' }],
  },
  {
    id: 'dumbbell_front_squat', label: 'Dumbbell front squat', shortLabel: 'Front squat', variation: 'Two dumbbells · shoulder height', analysisAvailable: true,
    muscles: [
      { id: 'quadriceps', label: 'Quadriceps', description: 'The quadriceps straighten your knees as you stand.' },
      { id: 'glutes', label: 'Glutes', description: 'The gluteus maximus helps extend your hips as you stand.' },
    ],
    summary: 'Weights close. Feet grounded. Stand with control.',
    camera: 'Use a front-side view that includes the dumbbells, torso, knees and both feet.',
    sources: [{ title: 'ACE · Dumbbell front squat technique', url: 'https://www.acefitness.org/resources/everyone/exercise-library/22/front-squat/' }, { title: 'NASM · Dumbbell front squat', url: 'https://www.nasm.org/resource-center/exercise-library/dumbbell-front-squat' }],
  },
];

const techniqueNotes: Record<ExerciseId, ExerciseReference['notes']> = {
  dumbbell_curl: [
      { title: 'Set up the curl', text: 'Hold the dumbbells with your palms facing forward and your arms beside your torso. Keep your upper body steady before beginning the lift. You can curl both arms together or alternate arms.' },
      { title: 'Move mainly at the elbow', text: 'Bend your elbow to bring the dumbbell upward while keeping your upper arm relatively steady. Avoid swinging the whole arm forward to finish the lift. Small natural differences in movement are normal; this guide describes a basic standing curl.' },
      { title: 'Keep the wrist aligned', text: 'Maintain a straight line between your hand and forearm as you lift and lower. Avoid curling the wrist inward along with the dumbbell. The movement should come mainly from bending the elbow.' },
      { title: 'Keep your torso and shoulders quiet', text: 'Keep the torso steady instead of rocking backward to move the weight. Let the shoulders remain relaxed rather than lifting them toward the ears.' },
      { title: 'Control the return', text: 'Lower the dumbbell smoothly toward the starting position. Give the lowering phase the same attention as the lift rather than letting the weight drop.' },
    ],
  lat_pulldown: [
      { title: 'Set up the seat', text: 'Secure your thighs under the pad and take an overhand grip with your hands evenly spaced about the bar center. Pull both sides down together. Brace your trunk with a small, comfortable backward lean and keep your head aligned with your spine. The pad should help keep you seated as you pull.' },
      { title: 'Pull in front', text: 'Guide the bar toward your upper chest as your elbows move down beside you. Keep that initial torso position rather than leaning farther back to move the load. Stop the pull when your elbows no longer travel down; do not keep driving them far behind your body.' },
      { title: 'Return smoothly', text: 'Pause briefly at the bottom, then let the bar rise under control as your elbows straighten. Avoid letting the stack pull you abruptly upward. This reference uses a front pulldown, not a behind-the-neck variation.' },
    ],
  leg_extension: [
      { title: 'Adjust the machine', text: 'Follow the machine’s setup label. Adjust the seat so your knee aligns with its pivot and the lower-leg pad rests comfortably above your ankle. Use the adjustment handles before starting; the machine’s own instructions take priority because designs vary.' },
      { title: 'Keep your seat', text: 'Keep your back supported and hold the handles as you straighten your knees. Keep your chest lifted and your shoulders against the support. Avoid lifting your hips or kicking the weight to start the movement.' },
      { title: 'Control both directions', text: 'Straighten your legs fully at the top without forcing your knees beyond straight, then lower steadily. Maintain the same seated position throughout the return. Aim for a smooth transition into the next repetition instead of letting the weight stack slam down.' },
    ],
  dumbbell_front_squat: [
      { title: 'Hold the front rack', text: 'Support a dumbbell at each shoulder, with elbows forward and your trunk braced. Keep the dumbbells close to your shoulders and position your feet about shoulder-width apart, adjusting to a comfortable stance.' },
      { title: 'Lower together', text: 'Bend your hips and knees together. Keep your feet grounded and knees following the direction of your toes, working toward thighs approximately parallel to the floor for the full-rep reference, within a depth you can control. Let the hips move back and down while keeping the chest lifted; do not force a deeper position by rounding your back.' },
      { title: 'Stand tall', text: 'Push through your feet to straighten your hips and knees. Keep the weights close rather than letting them pull your torso forward. Let your hips and chest rise together, without your hips shooting up while your chest drops. Finish in a balanced standing position before starting the next repetition.' },
    ],
};

const targets: Record<ExerciseId, string[]> = {
  dumbbell_curl: ['Biceps brachii'], lat_pulldown: ['Latissimus dorsi'],
  leg_extension: ['Quadriceps'], dumbbell_front_squat: ['Quadriceps', 'Gluteus maximus'],
};
export const EXERCISES: ExerciseReference[] = catalogue.map(item => {
  const id = ExerciseIdSchema.parse(item.id);
  return { ...item, id, muscles: item.muscles,
    version: id === 'dumbbell_curl' ? curlReference.version : id === 'lat_pulldown' ? 'lat_pulldown-2' : id === 'leg_extension' ? 'leg_extension-4' : id + '-4',
    criteria: exerciseCriteria[id], targetMuscles: targets[id],
    notes: techniqueNotes[id],
  };
});

export const getExercise = (id: string) => EXERCISES.find(exercise => exercise.id === id);
export const canAnalyzeExercise = (exerciseId: string): exerciseId is ExerciseId => ExerciseIdSchema.safeParse(exerciseId).success;
