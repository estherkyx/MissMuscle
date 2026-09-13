# Multi-exercise implementation and handoff

All four dropdown variations support local upload, Astra review, submitted-frame
evidence seeking, body mapping and synchronized illustrations. Live camera coaching
supports all four exercises with automatic spoken corrections, specific reassurance
and next-rep reminders without microphone capture.
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
  support the same four exercises and reject mismatched session findings. Schema version stays `1`;
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
locks until reset for tracked/uploaded movement. Live reference demonstrations
use independent, smooth loops with fixed exercise-appropriate views; body maps
continue following the camera. Hidden/collapsed joints and ambiguous people do
not create observed repetitions. Colors indicate
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


## Live expansion integration

All four exercise selections mount `LiveExercise` keyed by the selected ID;
switching exercises stops the old camera/voice session and clears review state.
Person A passes the ID through camera windows, body maps, looping references,
coaching cues and rep-based retention. Pulldown and leg-extension detectors anchor
at the seated hip, while squat retention anchors at the planted ankle so normal
squat descent is not mistaken for walking toward the controls. These are replay
selection heuristics, not form or rep-count measurements.

Person B's compact live schema uses exactly the selected criterion IDs and count.
Squat depth and leg-extension range checks can cite three submitted moments;
existing endpoint requirements still apply. The live rubric and voice session
name the selected variation. The successful four-frame request path, deadlines,
audio acknowledgment handling and stale-result recovery remain in place.
`shared/contracts.ts` permits all four live exercise IDs and rejects a context
whose latest result belongs to a different exercise. Browser voice contexts also
reject changing exercise mid-session. Release browser and server changes together.

The expansion passes 170 automated tests and both production builds. Real API
probes completed for all three added live exercises using repeated test artwork;
actual live exercise/speaker acceptance remains separate from those checks.


## Demonstration equipment

Recognizable demonstrations may use office/ordinary chairs, a hand-held bar for
pulldowns, bottles in place of dumbbells, or no external resistance. The selected
exercise remains the comparison; its visible movement can still receive
corrections. Analysis and voice keep the substitution implicit and focus on form.
Equipment-specific checks lacking actual landmarks stay unassessed, with neutral
wording, rather than becoming invented passes or blocking movement assessment.
The shared instructions live in `shared/movement-review-context.ts`.


## Squat turnaround review update

`dumbbell_front_squat-4` requires descent, actual deepest position and ascent for
positive depth feedback as well as a shallow-rep correction. Standing at the end
is not adequate-depth evidence. Live capture selects at most four real frames
around a tracked reversal from an eight-second buffer; a small/shallow excursion
can trigger review. Pose timing only selects footage; the provider still judges
the visible movement. Missing or obscured bottom evidence remains unclear. The
reference uses approximately parallel thighs, not an exact measured knee angle.


Leg-extension endpoint update: `leg_extension-4` requires three distinct supplied
moments for both positive and negative `full_extension` findings: lift, furthest
extension and return. Live capture now retains these actual frames using the same
eight-second buffer and four-image request limit as squats. Small partial lifts
can nominate a review; pose progress never directly grades extension. The prompt
requires a short-range correction when the visible turnaround is still clearly
bent, independently of smooth movement. Missing endpoints remain unclear.
Release the shared contract, browser and server together; older positive
leg-extension checks with only two moments need reanalysis. Mocked checks verify
capture and report wiring, not recognition accuracy on real movement.


Frontal-squat timing now includes visible hip lowering relative to the ankle,
so a knee that stays straight in the camera projection does not hide the rep.
This timing heuristic preserves real camera evidence for provider review; it
never decides whether depth is correct. The reviewer considers a clearly visible
high-hip turnaround from the front, while retaining uncertainty when perspective
or occlusion prevents comparison. Praise for other aspects explicitly qualifies
unconfirmed or deficient depth in the same review.
