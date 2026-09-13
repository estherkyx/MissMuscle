# Exercise technique resource review

Reviewed 13 September 2026 for the four MissMuscle exercise selections. This is
an engineering review of published coaching guidance, not validation of the
model's ability to detect mistakes. The linked pages provide instructions and,
where indicated, embedded demonstrations; video playback was not independently
reviewed in this pass.

## Resources and what they support

| Exercise | Resource | Useful guidance and scope |
| --- | --- | --- |
| Dumbbell curl | [Mayo Clinic: dumbbell curl video and transcript](https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/biceps-curl/vid-20084675) | Elbow-led movement, wrist alignment, avoiding arm swing, controlled lowering. Explicitly permits alternating arms. |
| Dumbbell curl | [ACE: seated biceps curl](https://www.acefitness.org/resources/everyone/exercise-library/44/seated-biceps-curl/) | Wrist, shoulder and elbow control. Seated reference: bench-contact instructions do not apply to our standing variation. |
| Dumbbell curl | [PureGym: dumbbell curls, instructions and demonstrations](https://www.puregym.com/exercises/arms-and-shoulders/bicep-curl/dumbbell-bicep-curls/) | Standing single/double-arm instructions; discusses swinging, rushed movement and shortened range. Its embedded double-arm demonstration text describes a seated variation, so use the standing written instructions for our selection. |
| Lat pulldown | [ACE: seated lat pulldown](https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/) | Seat anchoring, stable torso, downward elbow travel and controlled overhead return. Stop before continuing to pull the elbows behind the body. |
| Lat pulldown | [PureGym: lat pulldown instructions and demonstration](https://www.puregym.com/exercises/back/lat-exercises/lat-pulldown/) | Thigh-pad setup, overhand grip, steady torso and avoiding a sudden return. Written cues and demonstration transcript vary in endpoint/setup detail; do not convert those details into exact grading thresholds. |
| Leg extension | [PureGym: machine leg-extension instructions and demonstration](https://www.puregym.com/exercises/legs/quad-exercises/leg-extensions/) | Back support, pad near the ankles, holding the handles and a controlled return. Includes separate single-leg and banded variants, which should not be confused with the selected machine exercise. |
| Dumbbell front squat | [ACE: front squat with dumbbells](https://www.acefitness.org/resources/everyone/exercise-library/22/front-squat/) | Front-rack support, grounded heels, knee direction and hips rising with the torso. Gives control-related stopping conditions during descent. |
| Dumbbell front squat | [NASM: dumbbell front squat instructions and demonstration](https://www.nasm.org/resource-center/exercise-library/dumbbell-front-squat) | Identifies dropped elbows/weights, inward knee movement, heel rise and loss of upper-body posture as common mistakes. Exact depth recommendations are not automatic app requirements. |

The four new resources (PureGym curl, pulldown and leg extension; ACE front squat)
are included in each exercise's in-app **Watch & learn more** links. Their relevant
instructions are reflected in the shared reference consumed by analysis.

## Mapping guidance to video checks

| Selection | Shared criterion IDs | Evidence needed |
| --- | --- | --- |
| Standing curl | `steady_upper_arm`, `neutral_wrist`, `steady_torso`, `relaxed_shoulders`, `controlled_movement` | Arm position relative to the torso, wrist visibility, shoulders and torso across curl phases. Major torso/hip movement stays assessable as a possible form error. |
| Overhand pulldown | `stable_torso`, `front_pull`, `even_grip_pull`, `controlled_return` | Torso, elbow path and both hands/bar landmarks. Compare grip positions and travel with perspective accounted for. |
| Machine leg extension | `machine_alignment`, `supported_torso`, `full_extension`, `smooth_extension` | Actual visible machine pivot/pad, back/hip contact with the seat, and extension/return phases. Hidden contact or pivot means unclear. |
| Dumbbell front squat | `front_rack`, `squat_depth`, `squat_posture`, `grounded_feet`, `knee_tracking` | Weights, torso/hips, feet/floor and knees. New posture check covers a pronounced chest drop while the hips rise; normal forward lean alone is not a fault. |

These are app interpretations of coaching guidance. A static wrist view may use
one evidence frame; other assessed checks require at least two submitted frames. A shortened leg-extension
rep requires three ordered moments establishing lift, bent-knee top and return.
A shortened squat likewise needs descent, shallow turnaround and ascent.
Sparse observations can leave tempo unclear. Source agreement does not establish
that a particular clip contains the error.

## Decisions where guidance differs

- Alternating curl arms are allowed. Do not demand bilateral synchrony for curls.
- Squat depth is compared with the selected full-rep reference (thighs approximately
  parallel) only when the bottom and turnaround are visible. This is not a universal
  prescription or a measured 90-degree knee-angle test. Shin angle and knee position
  relative to the toes are not automatic failures.
- Pulldown endpoints differ between sources. Judge the visible elbow/bar path;
  do not require bar-to-chest contact or an exact lean angle.
- Leg-extension setup depends on the machine. A general tutorial's 90-degree
  starting cue is not a calibrated measurement rule. Machine instructions take
  precedence, and video cannot establish joint locking or tissue loading.
- Uneven grip/pull is a visual comparison, not evidence that one arm is weaker.
  Never infer force, activation, pain or injury from these checks.

## Existing PDF references and access limits

The existing [NSCA manual](https://www.nsca.com/contentassets/116c55d64e1343d2b264e05aaf158a91/basics_of_strength_and_conditioning_manual.pdf)
has a search-indexed instruction for even bar hand placement. Its full PDF could
not be retrieved by the web reader during this pass. The existing
[Life Fitness Optima manual](https://www.lifefitness.com.au/wp-content/uploads/2015/02/Optima_user_manual_for_all_strength_2_585_1371787541.pdf#page=18)
also could not be reopened. These links remain as prior references; this review
does not claim fresh full-document verification. The newly added HTML guides
were successfully opened and read.

## Implementation handoff and verification

[Shared contracts](../shared/contracts.ts) now includes `squat_posture`.
[Shared criteria](../shared/exercise-criteria.ts) and the browser checklist use
five squat checks; curl has five, pulldown four, leg extension four. The source
catalogue marks standing curl and pulldown as version 2;
leg extension and front squat are version 3. Deploy UI and server together and reanalyse reports
created with older checklists. No dependency or provider model changes.

Automated checks validate schema, exercise routing and rendering. Real-clip
acceptance still needs clear correct reps, individual visible mistakes,
occlusion, camera tilt and different body proportions for each selection.
