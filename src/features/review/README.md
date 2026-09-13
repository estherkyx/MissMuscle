# Person A: sourced curl comparison and review

## Exercise library update

`exercise-library.ts` is a browser-side catalogue. It adds lat pulldown, seated
leg extension, and dumbbell front squat without adding any new analysis models,
request exercise IDs, or provider routes. `ExerciseDiagrams.tsx` supplies original
schematics and approximate muscle-location diagrams. Exercise changes
reset the active clip/report, and reference-only selections do not expose analysis
or voice controls. Returning to dumbbell curl restores the existing analysis flow.

Targets are lats for pulldowns, quadriceps for leg extensions, and quadriceps and
glutes for the front squat. The squat reference specifies two dumbbells held at
shoulder height. All target muscles are shown together in the reference sheet, without a separate
muscle selector. No unsupported
quadriceps-head or lat-region targeting options are offered.

New references (paraphrased; no source imagery copied):

- [ACE seated lat pulldown](https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/)
- [NASM pulldown biomechanics](https://www.nasm.org/resource-center/blog/training/the-biomechanics-of-the-lat-pulldown-muscles-grip-and-form)
- [Life Fitness Optima manual, leg extension on printed page 17](https://www.lifefitness.com.au/wp-content/uploads/2015/02/Optima_user_manual_for_all_strength_2_585_1371787541.pdf#page=18)
- [NASM dumbbell front squat](https://www.nasm.org/resource-center/exercise-library/dumbbell-front-squat)

Machine setup follows the equipment's own labels; the illustrated leg-extension
machine is schematic. These references are educational prototypes, not validated
pose assessments or trainer sign-off.

[ReviewPanel](ReviewPanel.tsx) consumes `AnalysisReport` directly and displays
timestamped corrections linked to the main video, reference guidance,
visibility limitations, and next-attempt focus. Unassessable reports and assessable
reports with zero corrections have distinct empty states. Fixture findings stay
explicit and separate from analysis of uploaded footage.

## Reference-library decision

Use a curated, versioned local record for this one exercise. Live search belongs in
reference research/updates, not each video-analysis request: it adds latency and
can introduce incompatible variants. Neither a database service nor vector retrieval
is required for one rubric. Revisit storage when the exercise catalogue expands.

[curl-reference.ts](curl-reference.ts) contains version `standing-curl-1`, checked
2026-09-13, for the selected **basic standing, palms-up dumbbell curl**. Each criterion
has a stable ID, expected behavior, possible deviation, required visibility, cue,
and source identifiers. It uses paraphrases, not copied media or long extracts.

| Criterion | What to compare |
| --- | --- |
| `steady_upper_arm` | Elbow position relative to torso across phases; pronounced swing. |
| `neutral_wrist` | Hand/forearm alignment only when the wrist is clearly visible. |
| `steady_torso` | Torso/hip movement across frames, excluding camera movement. |
| `relaxed_shoulders` | Shoulder movement toward the ears when neck/shoulders are visible. |
| `controlled_movement` | Possible abrupt movement only with adequate temporal evidence. |

Use a fixed three-quarter side view with working hand, elbow, shoulder, torso and
hips in frame. This is a product camera recommendation, not a validated pose-estimation
protocol. Sparse samples cannot establish continuous control or detect all faults.
There are no numerical angle cutoffs, safety scores, activation measurements, or
claims that every elbow shift is incorrect.

## Sources and illustration review

- [Mayo Clinic: dumbbell curl](https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/biceps-curl/vid-20084675): elbow near body, wrist alignment, controlled movement and avoiding arm swing.
- [ACE: seated curl](https://www.acefitness.org/resources/everyone/exercise-library/44/seated-biceps-curl/): basic curl wrist, shoulder and torso cues; also explicitly documents a different forward-elbow/rotating variation. Seated bench-contact instructions are not applied to our standing variant.
- [OpenStax: upper-limb muscles](https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs): elbow flexors and approximate anterior upper-arm anatomy.

[Curl reference](../../../public/curl-reference.svg) and
[target-muscle guide](../../../public/target-muscles.svg) are original schematic
SVGs created for this project. The curl drawing illustrates elbow flexion with a
steady upper arm/torso. The muscle drawing marks approximate biceps location and
uses a dashed area for brachialis underneath. Neither is a copied source image,
measured pose, or muscle activation map. Labels have been checked against the above
references; this is source review, not clinical validation or human trainer sign-off.

The UI presents all criteria and their citations rather than guessing a criterion
from free-text correction titles. Existing report `referenceCue` appears beside
the observation. A correction-specific source mapping requires an agreed criterion ID.

## Coordination handoff for Person B

Integration update: the reference is now in `shared/curl-reference.ts`, with the
original import path re-exported for compatibility. The Astra prompt uses this
same reference. The main app uses the real voice adapter, forwards error and
cancellation callbacks, and appends its transcript fragments. The original
coordination requirements below remain useful for further changes:

1. Review/agree `curlReference` and coordinate promotion to a shared browser-safe
   module. Both prompt and visual UI must use the same reference version.
2. Supply the ordered frames plus that rubric to Astra. For each criterion, reason
   about supported behavior, a supported deviation, or insufficient evidence. Other
   curl variants should be described as outside this comparison, not inherently wrong.
3. Return up to three supported corrections using existing contract v1. Cite only
   submitted frame indices/timestamps and use null regions when localization is weak.
   Criterion-level assessment states are prompt guidance, not new HTTP fields.
4. Agree an additive criterion identifier before implementing deterministic links
   from individual corrections to specific reference entries. Until then, the UI
   displays the full sourced guide and the report's reference cue.
5. Ground voice in the resulting report and reference standard. Keep provider events
   within the owned voice adapter; use the [playback handoff](../video/README.md).

The analysis service and voice adapter are implemented and integrated. Detection
accuracy on real exercise clips still needs joint testing.

## Joint accuracy acceptance

Compare consented, human-reviewed clips of the supported curl, clearly visible
deviations, obscured wrists, cropped torsos, camera motion, and alternative curl
variants. Check false positives and missed deviations separately from playback QA.
The reference is guidance; different body proportions are not errors. Do not attach
sample findings to these clips or infer that an unflagged clip proves correct form.
