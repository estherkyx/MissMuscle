import { AnalysisReportSchema } from '../contracts';

// Synthetic UI fixture. No uploaded footage has been analysed.
export const demoReport = AnalysisReportSchema.parse({
  schemaVersion: '1',
  id: 'fixture-report-1',
  clipId: 'fixture-clip-1',
  exerciseId: 'dumbbell_curl',
  durationSec: 12,
  source: 'fixture',
  summary: 'Sample report for interface development. These observations are fictional, not findings about your video.',
  visibility: { assessable: true, limitations: ['Synthetic fixture: no real clip was analysed.'] },
  targetMuscles: ['Biceps brachii', 'Brachialis'],
  corrections: [
    {
      id: 'correction-1', title: 'Example: upper-arm movement', priority: 'focus_first',
      observation: 'Example observation: the upper arm moves forward during the lifting phase.',
      cue: 'Example cue: keep your upper arm more still as you curl.',
      referenceCue: 'Show a reviewed reference image of the same exercise phase here.',
      evidence: [{ frameIndex: 4, timestampSec: 4, region: { x: 0.55, y: 0.2, width: 0.2, height: 0.3 } }],
    },
    {
      id: 'correction-2', title: 'Example: trunk movement', priority: 'practice_next',
      observation: 'Example observation: the trunk changes position near the top of this repetition.',
      cue: 'Example cue: focus on a steady torso for the next attempt.',
      referenceCue: 'Show the reviewed torso-position reference here.',
      evidence: [{ frameIndex: 8, timestampSec: 8, region: null }],
    },
  ],
  nextAttemptFocus: 'Sample focus: practise one cue, then record another short attempt.',
});
