# Multi-exercise implementation and handoff

All four dropdown variations support local upload, Astra review, submitted-frame
evidence seeking, GPT-Live discussion, body mapping and synchronized illustrations.
The production interface uses uploaded clips; fictional curl fixtures remain in tests and the voice development harness.

Integration with main retains the Analyze clip action, expandable form checklist,
evidence seeking, reference dialog, and the single body-mapping toggle.
Shared contract update: form-check IDs and counts now follow the selected exercise
criteria in `shared/exercise-criteria.ts`; server validation and the browser checklist
use that same catalogue. Person A and Person B should use these shared definitions.

## Shared interfaces and ownership

- [contracts](../shared/contracts.ts) exports `ExerciseId` from the four-value Zod
  enum. Requests, reports and voice contexts share it. Schema version stays `1`;
  deploy UI and server together because older servers accept only curl requests.
- [exercise catalogue](../shared/exercises.ts) owns labels, variants, camera tips,
  target muscles and sources. It attaches versioned [criteria](../shared/exercise-criteria.ts)
  used both in the reference sheet and analysis instructions. The old browser
  catalogue remains a compatibility re-export; browser code never imports server code.
- Person A: `extractFrames(clip, exerciseId, signal, onProgress)` requires the selected
  ID. `MuscleOverlay` and `ReferenceMotion` also require it. Cached requests match
  both exercise and clip. Exercise changes run the existing reset/voice teardown
  and unmount the old tracker. The generation guard rejects stale work.
- Person B: analysis picks the selected registry record and derives report muscles
  from it. No endpoint or voice wire protocol changes. Voice receives the active
  report via the existing typed interface. No dependencies or model IDs changed.

## Reference review

Technique sources checked 2026-09-13:

| Variation | Source and bounded comparison |
| --- | --- |
| Standing palms-up curl | Existing [curl reference](../shared/curl-reference.ts); steady arm/torso, wrist alignment and visible control. |
| Seated overhand front pulldown | [ACE](https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/): torso stability, downward elbow travel, controlled overhead return. |
| Seated machine leg extension | [Life Fitness manual, printed p. 17](https://www.lifefitness.com.au/wp-content/uploads/2015/02/Optima_user_manual_for_all_strength_2_585_1371787541.pdf#page=18): visible pivot/pad setup, back support and controlled extension/return. Machine-specific setup labels take precedence. |
| Two-dumbbell front squat | [NASM](https://www.nasm.org/resource-center/exercise-library/dumbbell-front-squat): front-rack stability, visible heel contact and knee movement relative to feet. |

Criteria include visibility requirements. Different or unclear variations produce
an unassessable report without corrections against the wrong exercise. This is a
prompt instruction, not an independently validated exercise classifier. No fixed
squat depth, joint angles, injury diagnoses, activation measurements, or claims
about hidden machine settings are used. Source review is not trainer certification
or validation of model accuracy.

## Motion behavior

The existing MediaPipe detector still runs locally, separately from Astra. No
body-map landmarks are sent to the voice model. All views share the video timeline.

- Curl retains its elbow-bend synchronizer and reference pose.
- Pulldown uses upper-arm position relative to the torso; its reference includes
  seated legs and a schematic bar/cable.
- Leg extension uses projected knee extension; its reference keeps the seated
  thigh still while the lower leg extends, with a schematic seat and ankle pad.
- Front squat uses projected knee bend with shoulder/hip/knee/ankle visibility;
  the authored pose bends hips and knees with fixed feet and front-rack weights.

Angles map only to illustration progress, never grading thresholds. Side selection
locks until reset. Hidden/collapsed joints, ambiguous people and seeking suppress
reference motion; no timer advances an invented repetition. Colors indicate
educational target areas, not anatomical segmentation. Lat and glute patches are
approximate torso-side/hip areas and cannot establish front/back surface visibility.

## Acceptance

`npm run check` passed on 2026-09-13: 70 tests, TypeScript, browser build and
Worker bundle. Local documentation links and `git diff --check` also passed.
New controlled tests cover every exercise through extraction,
API analysis, server-derived muscles/timestamps, voice handshake/context and typed
playback commands; also unknown IDs, mismatched reports, visibility limitations,
extraction cancellation, pose bounds/geometry, motion direction/holds/reversals,
aspect ratios, occlusion, multiple people and educational colors.

Real footage and live microphone acceptance remain to be performed. With a
consented clip of each supported variation, check analysis against the actual
frames, click and voice seeking, camera guidance, the body map and reference
through play/pause/seek, and loss of tracking when joints leave view. Switch
exercises after a report and confirm the clip, findings and microphone clear.
Verify provider failures show errors without sample findings. Do not claim
accuracy from mocked provider responses or authored pose tests. Keep footage
under ignored `demo-private/`; no deployment is included in this change.
