// Shared reference used by the analysis prompt and the visual guide. Contract v1 is unchanged.
// Source-checked educational rubric, not a clinically validated detection system.
export const curlSources = {
  mayo: { title: 'Mayo Clinic: dumbbell curl', url: 'https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/biceps-curl/vid-20084675' },
  ace: { title: 'ACE: basic curl technique and variations', url: 'https://www.acefitness.org/resources/everyone/exercise-library/44/seated-biceps-curl/' },
  puregym: { title: 'PureGym: dumbbell curl guide and demonstrations', url: 'https://www.puregym.com/exercises/arms-and-shoulders/bicep-curl/dumbbell-bicep-curls/' },
  anatomy: { title: 'OpenStax: upper-limb muscles', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs' },
} as const;

export const curlReference = {
  version: 'standing-curl-2',
  exerciseId: 'dumbbell_curl',
  variant: 'Basic standing, palms-up dumbbell curl',
  reviewedOn: '2026-09-13',
  camera: 'Record from a fixed three-quarter side view, with the working hand, elbow, shoulder, torso and hips visible throughout a full repetition.',
  limitations: 'Compare movement phases and body-part relationships, not pixel similarity or fixed angle thresholds. Other curl variants are outside this comparison. Sparse frames may miss motion between samples.',
  criteria: [
    { id: 'steady_upper_arm', title: 'Steady upper arm', expected: 'Bend at the elbow with the upper arm relatively steady beside the torso.', deviation: 'Pronounced upper-arm or elbow swing during lifting.', visibility: 'Compare the elbow relative to the torso in multiple phases.', cue: 'Keep your upper arm quieter as you lift.', sources: ['mayo', 'ace'] },
    { id: 'neutral_wrist', title: 'Aligned wrist', expected: 'Keep the hand and forearm aligned.', deviation: 'A clearly bent wrist while curling.', visibility: 'The hand, wrist and forearm must be clearly visible.', cue: 'Keep your wrist aligned with your forearm.', sources: ['mayo', 'ace'] },
    { id: 'steady_torso', title: 'Steady torso', expected: 'Keep the torso steady through the curl.', deviation: 'Pronounced repeated torso rocking, backward lean, or torso/hip lowering and rising during the curl.', visibility: 'Compare torso and hips relative to the curl across multiple phases; distinguish camera motion and small natural adjustments from pronounced body movement.', cue: 'Keep your torso steady as the weight rises.', sources: ['ace'] },
    { id: 'relaxed_shoulders', title: 'Relaxed shoulders', expected: 'Avoid lifting the shoulders toward the ears.', deviation: 'Visible shoulder shrugging during the lift.', visibility: 'The shoulders and neck must be visible across frames.', cue: 'Let your shoulders stay relaxed as you curl.', sources: ['ace'] },
    { id: 'controlled_movement', title: 'Controlled movement', expected: 'Raise and lower the weight smoothly.', deviation: 'Possible abrupt or uncontrolled movement.', visibility: 'Needs closely spaced temporal evidence; mark not assessable when sparse sampling cannot establish control.', cue: 'Lift and lower with control.', sources: ['mayo'] },
  ],
} as const;
