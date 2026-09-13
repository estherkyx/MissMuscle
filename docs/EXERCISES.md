# Multi-exercise implementation and handoff

All four dropdown variations support local upload, Astra review, submitted-frame
evidence seeking, body mapping and synchronized illustrations. Live camera coaching
is curl-only and provides automatic spoken corrections without microphone capture.
Uploaded review has no voice session. Fictional curl fixtures remain in tests and
the separate conversational voice development harness.

Integration with main retains the Analyze clip action, expandable form checklist,
evidence seeking, reference dialog, and the single body-mapping toggle.
Shared contract update: form-check IDs and counts now follow the selected exercise
criteria in `shared/exercise-criteria.ts`; server validation and the browser checklist
use that same catalogue. Person A and Person B should use these shared definitions.

## Pulldown grip check update

Person A / Person B handoff: `lat_pulldown-2` adds `even_grip_pull` to
[contracts](../shared/contracts.ts) and the shared criteria. New pulldown reports
require four checks. The provider schema and browser checklist consume these
shared definitions; release the UI and server together and reanalyse older
pulldown reports. Other exercises retain their existing criteria.

The new check covers visibly unequal hand spacing or uneven pulling, with at
least two submitted evidence moments. Both hands and relevant bar landmarks must
be visible; perspective, camera roll, curved bars and equipment asymmetry must
not become false corrections. Uncertain comparisons stay unclear. The
[NSCA strength and conditioning manual](https://www.nsca.com/contentassets/116c55d64e1343d2b264e05aaf158a91/basics_of_strength_and_conditioning_manual.pdf)
supports even hand placement; the visual comparison remains an app heuristic,
not a validated measurement. Mocked tests verify prompt delivery, evidence and
checklist integration, not detection accuracy on real clips.

## Leg-extension completion check update

Person A / Person B handoff: `leg_extension-3` adds `full_extension` to
[contracts](../shared/contracts.ts) and the shared catalogue. New leg-extension
reports require four checks. The checklist distinguishes range completion from
smooth movement. For `needs_attention`, the completion check requires three
submitted evidence moments showing lift, visibly bent-knee top, and return;
missing endpoints or an obstructed view remain unclear. It never requires
hyperextension or a precise measured knee angle. This follows the full
straightening instruction in the [PureGym guide](https://www.puregym.com/exercises/legs/quad-exercises/leg-extensions/).
Deploy UI and server together and reanalyse older leg-extension reports.
Mocked checks cover schema, prompt delivery and rendering; real-clip accuracy
remains to be verified.

## Squat-depth check update

Person A / Person B handoff: `dumbbell_front_squat-3` adds `squat_depth` to the
shared contract and catalogue, making five squat checks. The full-rep reference
uses thighs approximately parallel, following the linked ACE/NASM resources;
it does not estimate a 90-degree knee angle or require forced depth. A short-rep
finding needs at least three submitted moments establishing descent, a clearly
shallow turnaround, and ascent. Missing endpoints or unclear perspective remain
unclear. Release UI/server together and reanalyse older squat reports.
This update does not change curl analysis.

## Shared interfaces and ownership

- [contracts](../shared/contracts.ts) exports `ExerciseId` from the four-value Zod
  enum. Uploaded requests and reports share it; live contexts and analysis windows
  are restricted to dumbbell curls. Schema version stays `1`;
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

See the [expanded technique resource review](TECHNIQUE_REVIEW.md) for additional
instructions and demonstrations, source-to-criterion mapping, and differences
that must not become rigid grading rules. The update adds `squat_posture` to the
shared contract (now five squat checks, including `squat_depth`) and expands leg-extension seat-contact
checks. Person A and Person B should release the shared catalogue together.


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
