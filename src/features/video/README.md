# Person A: video and playback handoff

Multi-exercise update: [exercise handoff](../../../docs/EXERCISES.md). The player
passes an explicit exercise ID into extraction, body mapping and reference motion.
Curl-specific descriptions below document the original implementation.

The implementation is composed by [App](../../App.tsx), using the unchanged
[shared contract](../../../shared/contracts.ts) and [analysis client](../../lib/api.ts).
Person B's server and voice adapter remain separately owned. The moving muscle
overlay adds the pinned frontend dependency `@mediapipe/tasks-vision@0.10.32`;
the lockfile is updated. Shared contracts and package scripts are unchanged.

## Synchronized body map

[MuscleOverlay](MuscleOverlay.tsx) now renders a separate body-map canvas beside
original footage. Choose **Start body mapping**, wait for preparation, then use the original video
controls to play, pause, or seek both views. [mapped-body.ts](mapped-body.ts)
draws a 2D joint-driven illustration on a dark grid, with red upper-arm target
areas, yellow supporting forearm areas, and gray other areas. The matching
[target guide](../../../public/target-muscles.svg) uses the same color legend.
These are fixed educational curl categories, not measured activation, intensity,
muscle segmentation, a 3D reconstruction, or a generated/exportable video file.

Inference uses the existing pinned MediaPipe dependency and downloaded WASM/model.
Video inference stays local and uses MediaPipe VIDEO tracking. Multiple people
clear the map. [The pose filter](pose-filter.ts) accepts finite, in-frame joints
with visibility at least 0.75, smooths movement, and rejects isolated jumps;
two consistent detections can reacquire a displaced joint. Joints with visibility
from 0.5 to below 0.75 can remain visible after two consistent
detections, as dashed uncertain outlines without target colors. This applies
equally to either arm and uses that joint’s own detected position. Missing joints
retain their last accepted position for 150 ms of clip time, then fade out by
350 ms. Uncertain observations and inferred or retained joints never get target colors.
Uploaded reference timing may use consistent detections with visibility at least
0.5; retained positions are excluded from its movement signal. No body-map limb
is replaced with an authored reference limb.
Reacquisition after expiry starts at the new detection rather than an old position.

Framing uses the video's fixed contain rectangle, so a wandering joint cannot
resize the body. Thickness is calibrated from reliable torso joints, not changing
shoulder width. Preparation samples the clip at 10 Hz with a separate video, then
releases its detector. Playback uses monotone cubic interpolation between cached joint positions.
Preparation bridges joint occlusions of up to 0.6 seconds between observations
of the same joint; inferred positions stay dashed and cannot cross multiple
people or missing scan samples. Never-observed limbs are not fabricated.
Pausing freezes the map and fade timers; seeking reads the same cached timeline.
Resizing only redraws. Stop mapping, replace the clip, or unmount to cancel scanning
and discard cached data. Model load failures remain explicit.

Regression coverage in [pose-filter.test.ts](pose-filter.test.ts) checks jitter,
outliers, reacquisition, fading, resets, uncertainty across all four exercises,
and fixed portrait/landscape framing. `npm run check` passes. Real-clip visual
acceptance remains pending: check fast repetitions, occlusion, pause, forward and
backward seeks, resizing, and clip replacement for each exercise. No local test
clip was available for this stabilization change.
Native video fullscreen and picture-in-picture show only the source footage.
No shared contract, voice interface, or dependency changes are needed for this view.

## Upload and extraction

[media.ts](media.ts) exports `loadLocalClip(file, signal)` and
`extractFrames(clip, exerciseId, signal, onProgress): Promise<AnalysisRequest>`.

- One local clip: greater than zero and at most 15 seconds, at most 40 MiB.
- A new `clipId` is generated on every successful upload. The browser checks actual
  video metadata, not the filename/MIME type alone. Decode errors recommend H.264 MP4.
- Extract 16 ordered JPEG frames through the clip using a separate video/canvas;
  the last seek is slightly before the exact endpoint. Record `video.currentTime`
  after each completed seek; these are media-timeline capture times, not independent
  measurements of motion or guarantees of 16 distinct source frames on very short clips.
- Preserve decoded orientation/aspect ratio, never upscale, limit the longest edge
  to 768 px, and reduce JPEG quality/size as necessary. Validate image and JSON limits.
- Metadata and seek waits have 12-second timeouts and abort/error cleanup. Object URLs
  are revoked on replacement/unmount. Only an explicit Analyze action sends frames.
- Requests already sent through the shared API client cannot be aborted by this
  workstream: its existing 90-second timeout remains. Operation generation and active
  clip ID checks prevent obsolete responses from entering the UI.
- Validate returned reports against the submitted request, including frame index and
  timestamp provenance. Reject fixture responses in analysis mode. Retry can reuse
  successfully extracted frames for the same clip.

## Playback interface for Person B

[playback.ts](playback.ts) exports `createPlaybackController(options)` with:

```ts
handleCoachCommand(command: CoachCommand): void;
showEvidence(correctionId: string, evidenceIndex: number): void;
cancel(): void;
dispose(): void;
```

`options` supplies the video element, current report/duration getters, selection
callback, settled callback, and error callback. Both correction cards and
`connectCoach({ onCommand: handleCoachCommand, ... })` use the same controller.

| Command | Behavior |
| --- | --- |
| `show_correction` | Validate ID, pause, select, seek to first evidence timestamp. |
| `seek_video` | Validate active duration, pause and seek. |
| `pause_video` | Pause immediately and cancel pending actions/replay. |
| `replay_segment` | Validate bounds, seek to start, play, pause at end. |

Commands pass `CoachCommandSchema` plus active-report and clip-bound checks. Unknown
IDs never select a substitute. New commands, manual seeks/pauses, replacement, and
dispose cancel pending replay. Replay checks use animation frames plus time updates;
the player corrects overshoot to the segment end when notified by the browser.

The main video is the primary review surface. Clicking a correction beneath it
pauses, seeks to its evidence, and scrolls the player into view. At matching paused
evidence times (within 0.05 seconds), `EvidenceOverlay.tsx` draws the approximate
region over the video. Its SVG uses the submitted frame's dimensions and the same
contain alignment as the player, so letterboxing is excluded. Playing/seeking
elsewhere hides the overlay; null regions and fictional reports produce no box.
This is a keyframe annotation, not continuous tracking.

## Sample and voice

Sample mode imports `demoReport` locally with persistent fictional-findings labels.
Its separate local picker accepts 12–15-second clips and uses the first 12 seconds
for its timeline. Sample findings never claim to describe that footage, draw actual
evidence boxes, or become a fallback for failed analysis. Changing modes clears both
clip and report. Personal clips remain outside Git; use `demo-private/` if storing
local demo files.

The development-only simulator offers all four commands and is labelled **not
GPT-Live**. Production builds omit it. Voice controls consume Person B's unchanged
adapter and display real status/transcript/errors; no fake audio is supplied.

`CoachContext` includes the full current report, playback time, and nullable stable
correction ID. Updates occur on selection, completed seeks, play/pause, and throttled
time updates (no more than every 250 ms during playback). A sample context retains
`source: fixture`. Pending setup and disconnect are serialized; stale callbacks are
ignored, and late connections are disconnected. End the session before switching
clip/report; unmount also initiates cleanup. Person B owns microphone/media cleanup
inside `disconnect()` and interpretation of interim transcript events.

## Checks

From the repository root:

```sh
node --import tsx --test src/features/video/video.test.ts src/features/review/coach-session.test.ts src/features/review/review.test.ts
npm run check
```

The first command runs only the original feature checks; integrated `npm test`
now includes these files as well as the root tests. Feature tests cover limits, sampling, scaling, wait cleanup,
command rejection, click/voice parity, replay cancellation, and late voice lifecycle.

Browser acceptance: upload portrait and landscape clips, inspect submitted JPEGs,
exercise card/simulator seeking and bounded replay, verify annotations exclude
letterboxing, replace a clip during analysis, and confirm error/sample isolation.
Check a 390 px viewport. A phone clip and real provider/voice round trip require
joint testing with Person B; synthetic browser QA establishes mechanics only.

Implementation verification: 14 feature tests pass. Headless Chrome checks passed
for actual synthetic-video decoding/JPEG extraction, portrait/landscape scaling,
sample isolation, stale-response rejection, evidence alignment, replay termination,
and provider/codec failure messages. Reference SVGs load at desktop and 390 px widths.
Synthetic test responses are confined to the local QA harness, never app fallback code.


## Third view: reference form

[ReferenceMotion](ReferenceMotion.tsx) renders [authored spatial exercise poses](reference-spatial.ts)
using movement phase from the same tracked frames as the body map. The original
video controls play, pause and seek all three views; there is no independent clock.
[Reference facing](reference-view.ts) estimates horizontal body rotation from
reliable shoulder and hip world landmarks. It follows front, rear, side and
three-quarter views without copying observed torso lean or form errors.

Rotation is prepared with clip-time smoothing and holds the last reliable estimate
for at most 0.35 seconds. Seeking reads the cached estimate; clip/exercise changes
or mapping restart discard it.
Conflicting torso directions or missing landmarks clear the tracked facing
once the hold expires. Multiple people clear the estimate.
Facing remains approximate; no measured angle or reconstructed anatomy is claimed.
An unavailable estimate changes to the labelled example camera angle, without
hiding the reference illustration.

The [reference renderer](reference-renderer.ts) projects body and equipment through
the same rotation with fixed 3:4 framing, drawing farther geometry first.
The reference automatically follows clip playback, pausing and seeking with it.
There are no separate example playback controls or movement slider. Directional
segments include clips that start or end mid-movement, labelled approximate.
Brief gaps up to 0.6 seconds are interpolated from surrounding movement samples.
The full authored range eases smoothly between detected direction changes.
Without usable movement evidence, the illustration holds its pose. Missing facing estimates use
an explicitly labelled authored three-quarter angle while reliable movement
timing continues to follow the clip.
The 2D pose helpers and reference-sheet endpoints project the same spatial poses.
No server or shared interface changes are required.

Validation: npm run check covers tests, TypeScript, client and server builds.
Orientation tests cover cardinal/oblique angles, mirroring, aspect ratios,
wraparound, tracking loss, resets, constant 3D segment lengths and canvas bounds.
Real-clip visual acceptance remains separate from these synthetic checks.

## Full-range references for all supported exercises

[Reference scan](reference-scan.ts) prepares a browser-local, 10 Hz timeline. It pauses
the visible player without seeking it, reports progress and supports cancellation.
[Reference timeline](reference-timeline.ts) detects bounded movements independently
of their observed amplitude, then maps each movement to the complete authored range.
Curls, pulldowns, leg extensions and front squats all use progress 0 for the start
and 1 for the opposite endpoint, reversing on return.

Timing uses a three-sample median, six-degree reversal hysteresis, 0.25-second
minimum movement intervals and 0.2-second holds (0.5-degree plateau tolerance).
These are illustration timing settings, never analysis thresholds. Side selection
locks for the scan. Brief occlusion can be inferred from neighboring samples; multiple people,
missing scan samples and longer occlusions interrupt reference motion. Unbounded
clip edges can supply approximate lifting/lowering segments. Stationary footage
holds a reference pose and does not create a repetition.
Body mapping remains observed movement, not the target pose. Interpolation and
facing are approximate. The cache is local to one mounted clip/exercise and is
cleared on replacement, stop or unmount; no footage is persisted or uploaded by it.

[Authored geometry](reference-spatial.ts) supplies both the animated reference and
the reference-sheet endpoints. [Source review](../review/README.md#full-range-demonstration-review)
records the selected variants and visual criteria. Any future exercise must supply
a source-reviewed start, endpoint, return and timing signal before release.

Tests cover full/partial reps, tempo, holds, uncertain edges, cancellation, scan
failures, deterministic seeking, fixed limb lengths and equipment attachment.
Real exercise footage is still needed to evaluate repetition detection accuracy;
synthetic geometry and browser layout checks do not establish that accuracy.

Verification on 2026-09-13: `npm run check` passed 92 tests, TypeScript and both
builds. Headless Chrome rendered all four references at start/midpoint/finish
from four angles, and all reference sheets at 1440 px and 390 px without horizontal
overflow. A real browser detector scan on labelled synthetic stationary footage
produced no invented repetition; repeated seeks returned identical body-map pixels
and stopping mapping succeeded. The local harness supplied the known three-second
duration for its streaming WebM fixture; it did not mock the pose detector.

Mapping availability update: regression tests cover lower-confidence observations
on both arms, rejected inconsistent detections, recovery after occlusion, and
automatic directional reference timing, cubic playback interpolation and bounded
occlusion inference. Missing facing uses the labelled example camera angle. Shared contracts,
provider modules, voice interfaces and dependencies are unchanged. Real-clip
visual acceptance remains necessary; Chrome computer access was denied during
this verification session.

Automatic reference update: `npm run check` covers mid-lift/mid-drop clips,
full/partial repetitions, inferred gaps, stationary holds, deterministic pause
and backward seeking, clearer-right-arm selection, smooth joint velocity and
no interpolation overshoot. These synthetic checks do not establish detector
accuracy on the user’s actual footage.


## Live reference template

Live mode uses a fixed three-quarter reference template on a four-second loop,
with smooth lifting/lowering and full authored range. It does not consume pose
phase or camera-facing estimates. Its canvas redraws on animation frames without
per-frame React state updates; it stops when the live view is inactive. The
body map still follows camera observations. Uploaded reference synchronization
is unchanged. The live header labels the reference as a looping example.
