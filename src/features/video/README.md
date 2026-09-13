# Person A: video and playback handoff

The implementation is composed by [App](../../App.tsx), using the unchanged
[shared contract](../../../shared/contracts.ts) and [analysis client](../../lib/api.ts).
Person B's server and voice adapter remain separately owned. The moving muscle
overlay adds the pinned frontend dependency `@mediapipe/tasks-vision@0.10.32`;
the lockfile is updated. Shared contracts and package scripts are unchanged.

## Synchronized body map

[MuscleOverlay](MuscleOverlay.tsx) now renders a separate body-map canvas beside
original footage. Choose **Start body mapping**, then use the original video
controls to play, pause, or seek both views. [mapped-body.ts](mapped-body.ts)
draws a 2D joint-driven illustration on a dark grid, with red upper-arm target
areas, yellow supporting forearm areas, and gray other areas. The matching
[target guide](../../../public/target-muscles.svg) uses the same color legend.
These are fixed educational curl categories, not measured activation, intensity,
muscle segmentation, a 3D reconstruction, or a generated/exportable video file.

Inference uses the existing pinned MediaPipe dependency and downloaded WASM/model.
Video inference stays local. Multiple people suppress the map; missing/low-visibility
joints suppress their connected segments. Seeking and resizing clear the old pose.
Detection runs at most about 12 times per second, so the map can lag playback on
slower devices. Pausing retains the latest detection, and backward seeks trigger
fresh inference. Stop mapping, replace the clip, or unmount to release the tracker.
Native video fullscreen and picture-in-picture show only the source footage.
No shared contract, voice interface, or dependency changes are needed for this view.

## Upload and extraction

[media.ts](media.ts) exports `loadLocalClip(file, signal)` and
`extractFrames(clip, signal, onProgress): Promise<AnalysisRequest>`.

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

[ReferenceMotion](ReferenceMotion.tsx) reuses [the body-map renderer](mapped-body.ts)
with an [authored curl pose](reference-pose.ts). It starts paused, with independent
play/pause and scrub controls. This is an educational demonstration using the
existing [curl rubric](../review/curl-reference.ts), not a corrected user pose.
Shoulders, upper arms and torso stay fixed while the forearms lift and lower with
aligned wrists. Timing is illustrative, not a prescribed cadence. The reference
wraps below the original/body-map pair on narrow screens. No shared interfaces
or dependencies change.

## Movement-synchronized reference

The third panel now consumes the same detected frame as the body map via
[curl-sync.ts](curl-sync.ts). It follows projected elbow bend rather than a fixed
animation clock: video pause, speed changes and seeking govern all three views.
A visible shoulder/elbow/wrist chain is selected and retained until mapping resets.
Missing landmarks or multiple people hide the reference, with no independent loop
or sample fallback. Seeking resets direction history. Torso and upper-arm reference
positions remain authored. Camera projection and partial range can affect timing;
this is approximate phase matching, not measured anatomical speed or a prescription.
