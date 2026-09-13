# Person B: implementation and handoff

Current exercise expansion: see [multi-exercise implementation and handoff](EXERCISES.md).
All four dropdown variations now have analysis and motion support; curl-only
instructions below describe the original build. Real-clip acceptance is still required.

Updated 13 September 2026. Working branch: `agent-integration`.

## Integration update

Person A's `video-visual` work was already merged into remote `main` at `181c75e`.
That commit is now merged into this branch without Git conflicts, preserving
Person B's implementation in `0704835`. The main app now wires uploads, frame
extraction, real analysis, evidence playback, and voice together. Integration fixes
preserve transcript fragments, forward voice errors/cancellation, and share the
versioned curl reference between the UI and analysis. All 45 tests are included
in `npm run check`. These commits are local; no integration push or deployment
has been performed.

Open the running main app at http://127.0.0.1:5174/ to test the combined flow.
Use Review my clip, choose a short curl recording, Analyze clip, select a correction,
then start voice and ask to show the evidence. Real clip accuracy and browser
audio/playback acceptance still need checking after this merge.

## Implemented

- `POST /api/analyze`: real `gpt-6-astra` Responses request with ordered images,
  a conservative dumbbell-curl rubric, and strict structured output. The server
  owns report IDs, clip metadata, target-muscle labels, and evidence timestamps.
  Invalid evidence, refusals, missing visibility, and provider errors are handled
  explicitly. There is no synthetic fallback.
- `POST /api/live/session`: real `gpt-live-1` WebRTC handshake using the official
  OpenAI API. Delegated Astra responses receive report/playback context and the
  four allowed playback tools.
- `connectCoach`: microphone and remote audio, transcript fragments, current
  context updates, validated tool dispatch, duplicate-event protection, graceful
  End, and cancellation while a handshake is pending.
- A standalone voice harness under `src/features/voice/`. It does not alter the
  main app or ship as a production page in the current Vite build.

No dependencies were added. `shared/contracts.ts` and `src/lib/api.ts` are
unchanged. The additive shared coach configuration and curl reference are needed
by both workstreams. `CoachOptions` adds optional `onError` and `signal` fields.

## Evidence so far

| Check | Result |
| --- | --- |
| Official model-access requests | HTTP 200 for both `gpt-6-astra` and `gpt-live-1` |
| Real Astra image request | Passed with a generated blank image; `source: astra`, unassessable, zero corrections |
| Real browser voice test | User reported the requested voice/second-correction harness test works |
| Automated checks | 45 tests cover both workstreams and integration; TypeScript and production build pass |
| Real exercise sequence accuracy | Pending testing with Person A's frame extractor and actual footage |
| Real video seeking/highlights from voice | Wired into the main app; real browser acceptance after merge pending |
| Final microphone/usage confirmation in a real browser | Verify End reaches idle and the microphone indicator disappears; teardown logic also has controlled tests |
| ChatGPT Sites | Not created or deployed; packaging/runtime compatibility remains unverified |

The blank-image test establishes real image and structured-output acceptance. It
does not validate movement accuracy. The voice harness's sample findings are
fictional, clearly labelled, and never presented as analysis of uploaded footage.

## Do next — Person B

1. End the current harness session and check the microphone indicator disappears.
2. Test the integrated main app with Person A; the handoff below describes the interfaces already connected.
3. Record permissioned 5–15 second dumbbell-curl clips with the arm, wrist, torso,
   and dumbbell clearly visible. Use an ordinary comfortable load. Keep originals
   in ignored `demo-private/`; do not stage personal footage or `.env`.
4. Test two distinct clips plus an obstructed view. Check each correction against
   its actual displayed evidence; check that an unclear view produces a limitation.
5. Follow [Sites integration](INTEGRATION.md#sites-deployment-handoff--person-b),
   then record the full demo on the hosted app. Reserve the final hour for this.

## Send this handoff to Person A

> Person B's Astra analysis and GPT-Live adapter are ready on `agent-integration`.
> The shared report/request/command contracts are unchanged. Include the new
> `shared/coach-config.ts` when integrating. Wire `analyzeClip()` to your extracted
> frames and render the actual returned report. Start voice via `connectCoach()`
> from a user click; pass `onError` and an AbortController signal. Route
> `onCommand` through your existing validated playback handler. For
> `show_correction`, pause, select the correction, seek to its first evidence,
> and show the annotation. Call `updateContext` when playback/selection changes;
> await `disconnect` on End and close the old session before replacing the clip.
> Transcript text arrives in fragments to append. The details are in
> `docs/CONTRACT.md`; a working standalone caller is
> `src/features/voice/voice-harness.tsx`.

Before the teammate can fetch this integration, push the local commits using the
team's normal Git workflow. The presence of a local branch is not a remote handoff.

## Local checks

```sh
npm run dev -- --port 5174
# Open http://127.0.0.1:5174/src/features/voice/dev.html

npm run check
# Optional read-only model-access check; requires the local .env key:
node --import tsx scripts/check-openai.ts
# Optional real image request; replace dimensions with the JPEG's actual size:
node --import tsx scripts/smoke-analysis.ts /absolute/path/to/image.jpg 32 32
```

The image diagnostic sends one JPEG twice and incurs provider usage. It is not a
motion-analysis test. Ordinary tests are offline and do not use the API key.
Use localhost on the computer or HTTPS after deployment for microphone access;
a plain HTTP LAN address on a phone may not permit microphone access.

## Rubric and implementation references

The curl rubric is a prototype adaptation of published technique guidance, not a
trainer-reviewed or clinically validated assessment. It focuses on visible torso
control, wrist alignment, and controlled motion while allowing individual range
and elbow movement. A qualified review of the final cues/reference illustration
is still useful before presenting them as authoritative coaching.

- [ACE seated biceps curl](https://www.acefitness.org/resources/everyone/exercise-library/44/seated-biceps-curl/)
  describes controlled curling and lowering, wrist alignment, and elbow variation.
- [ACE standing curl example](https://www.acefitness.org/resources/pros/expert-articles/4901/summer-boot-camp-arms-workout/)
  provides the standing dumbbell-curl movement reference.
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Live WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
- [Live delegation](https://developers.openai.com/api/docs/guides/live-delegation)
- [Session lifecycle](https://developers.openai.com/api/docs/guides/live-conversations)

Voice explanations use the existing report. Additional visual inspection during a
conversation and continuous camera analysis are not implemented. Approximate
evidence boxes and target-muscle labels are educational; they do not measure
muscle activation or prove safety.


## Live timing and freshness integration update

This change spans Person A's live capture/replay and Person B's provider/voice
adapter. Public schemas in `shared/contracts.ts` and the requested model IDs are
unchanged. `shared/live-timing.ts` holds the coordinated application timing policy.

- Person A: live reference canvas now shares the camera/body-map CSS mirror;
  recordings and analysis frames remain in source orientation. Capture uses
  presented video-frame callbacks and browser capture timestamps when available.
  Recorder origins use start-event timestamps instead of only the start request.
  Correction clips are cropped around cited evidence; explicit session-to-clip
  offset conversion and original assessed images support replay verification.
- Person B: `server/analysis/schema.ts` adds a compact live-only provider output
  shape (summary, visibility, checks). `analyze.ts` expands verified checks into
  the existing report using shared criterion guidance, with code-derived frame
  timestamps. Upload analysis is unchanged. Live instructions prioritize the
  most recent supported state, preserve actual evidence and keep output brief.
- `announceCue(text, { validForMs })` is an additive optional adapter argument.
  The optional deadline is checked only when admitting a cue. It no longer
  mutes audio after submission or injects stop-commentary instructions. The prior
  implementation could expire before real audio started, causing silence.
  User mute/unmute now directly controls playback, and cue submission retries
  the real audio element. New cues wait for detected speech plus a short silence;
  a twelve-second recovery timer releases a stalled pending cue without muting
  speech. No synthetic or prerecorded substitute audio is used. This is local
  playback gating, not a provider audio-completion acknowledgment. GPT-Live may
  paraphrase commentary; actual delivery still requires a real-session check.
- Automatic mode receives no background report summaries or periodic context
  rewrites. Instructions allow only application-selected, evidence-backed reassurance
  about the reviewed rep and prohibit present-tense form assurances. Initial
  positive checks are supported; new corrections take priority, then specific
  praise alternates with next-rep reminders, with six-second reassurance spacing. Finding age is based on cited frames, not the end of a ten-second
  window, and older positive evidence cannot replace a newer correction.

Configuration: 400 ms frame sampling into an eight-frame local buffer, with four
evenly selected frames spanning the three-second analysis window,
first inspection after 1.2 seconds, one-second idle-slot checks, one in-flight
request, 45-second analysis recovery ceiling (plus five seconds of browser transport
grace), fifteen-second correction admission, twelve-second reassurance admission,
twenty-second educational reminder admission, three-second minimum cue spacing
and six-second per-criterion cooldown. These choices may
increase request frequency; the shorter window and output can trade temporal
context for responsiveness. Keep uncertain checks uncertain and evaluate actual
reps before claiming accuracy or latency gains.

Validation covers compact provider output, original evidence timestamps, clipped
replay origins across segment boundaries, stale positive-result suppression,
real audio remaining unmuted beyond the old admission deadline, user mute,
provider-stall recovery and existing lifecycle behavior. Real camera recording alignment,
spoken timing and latency improvement remain to be measured.

Sources checked during this update:
[OpenAI latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization),
[GPT-Live context and playback semantics](https://developers.openai.com/api/docs/guides/live-conversations),
[video frame metadata](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback),
[recorder start event](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/start_event).


Live reference/audio follow-up: the live form reference now renders an authored
four-second loop with fixed facing and eased reversals, independent of tracking.
It draws directly to canvas without updating React state per animation frame.
Tracking loss no longer hides or changes this reference. Uploaded references
retain their existing clip synchronization. Live provider notes are capped at
160 characters with at most two cited frames per check to keep output compact.
`npm run check` passes 145 tests and both builds; browser/provider audio and
end-to-end latency still require a real live-session acceptance check.


Active coaching follow-up: Person A's session announces an introduction once and
submits selected cues immediately after analysis as well as on regular ticks.
`coaching-cue.ts` distinguishes corrections, specific praise, and educational
next-rep nudges; repeated guidance does not assert a newly observed mistake.
Person B's adapter now sends a trusted `session.instructions.append` speech
prompt before each selected commentary update, keeps the silent input clock
running, retries a suspended AudioContext, and reports a twelve-second no-audio
stall instead of silently treating it as delivered speech. Actual remote energy
followed by silence releases the next cue. Acknowledgments are not proof of
playback; real browser/provider listening remains necessary. Public interfaces,
provider models, and evidence contracts are unchanged.

Regression coverage includes alternating praise/reminders despite slow playback,
fresh improvement after a correction, continued good-form reassurance, expiry,
explicit speech prompts, stalled audio notices, and release after simulated
remote audio. See the [GPT-Live session guide](https://developers.openai.com/api/docs/guides/live-conversations)
for speech prompting and the active input-audio requirement.

Active coaching validation: `npm run check` passes all 146 tests, TypeScript,
and the client/worker production builds. Real speaker playback was not tested.


Live timeout follow-up: the ten-second provider cutoff was producing the generic
`OPENAI_TIMEOUT` message, which is distinct from HTTP 429 `OPENAI_RATE_LIMIT`.
The initial fix raised the provider cutoff to fifteen seconds with two additional
browser transport seconds; the recovery update below supersedes that deadline. Fast
responses still return immediately. `src/lib/api.ts` preserves typed API error
codes and provides an automatic fresh-check message only for live timeouts.
User cancellation and rate/quota failures retain their separate behavior. No
stale request is retried; the existing single-request queue takes fresh frames.
Evidence-age limits still apply, so a late response need not produce speech.
The Session performance dropdown and its tracking-rate-only state were removed;
internal metrics used for observation ages and empty states remain.


Live recovery update: `buildLiveAnalysisInstructions` replaces the full upload
prompt in live mode (3,208 characters instead of 9,467). The camera submits four
actual frames spread across the same three-second window, maintaining submitted
frame indices and timestamps. Image detail and requested provider models stay
unchanged. The 45-second ceiling allows slow requests to complete; it is not an
intentional wait or a latency claim. The local dev adapter now propagates browser
disconnection to the provider so stopped sessions do not leave work running.

Person A always merges/displays completed results, through the additive
`onAssessment` callback, instead of dropping reports after fifteen seconds.
Unclear assessments show and explain their actual summary. Freshness still
controls normal coaching; a just-completed old result can be announced once as
an explicitly historical review. This does not declare the current pose correct.
A regular cue in cooldown cannot bypass that cooldown as a delayed review.

Person B's adapter puts the actual coaching text into the trusted immediate-speech
instruction and sends the delivery commentary only after the matching
`session.instructions.appended` acknowledgment. Unrelated/expired acknowledgments
are ignored. The additive `onCueStarted` callback requires detected remote audio;
accepted requests do not mark the introductory speech as played. A stalled
introduction can be requested again. Real media remains the only speech source.

Real-provider diagnostics: both configured model access checks returned HTTP 200.
The revised four-image request completed with five schema-validated checks in
9.4 seconds using repeated authored artwork. This was not a camera exercise or
an accuracy/speaker-playback test. `scripts/smoke-live-analysis.ts` is an explicit,
manual, billable diagnostic, outside npm tests; it logs timing and counts only.
No personal footage, credential values or provider bodies were logged.


Multi-exercise live handoff: all four exercise IDs are now accepted by live
contracts. Contexts validate report exercise identity as well as session/time;
existing voice sessions reject exercise changes. The server's live rubric and
schema select the shared catalogue's criterion IDs/count (four for pulldown and
leg extension, five for curls and squats). Evidence limits allow three moments
for leg-extension and squat endpoint checks; public evidence validation is
unchanged. Voice startup instructions name the selected exercise and variation.

Person A keys live components by exercise ID, passes that ID through frame
capture and body/reference rendering, derives correction labels/cues from the
shared criteria, and uses exercise-specific motion/anchors for last-rep replay.
Tests cover all four live routes, grounded correction/evidence retention, voice
contexts, delayed/unclear completion, UI/reference labels and either-side replay
selection. Switching exercise clears the old session rather than relabelling it.

Validation: `npm run check` passes all 170 tests, TypeScript and both production
builds. Explicit real-provider checks with repeated authored reference artwork
completed for pulldown (10.9 s, four checks), leg extension (8.1 s, four checks)
and front squat (9.4 s, five checks). These verify provider/schema integration;
real exercise accuracy and speaker playback for the new exercises remain
unmeasured. No personal footage or fixture findings were used as a fallback.

Shutdown diagnostics: once the user ends/cancels voice, missing finalization,
transport-close and other shutdown failures log to the developer console and
reject with the typed `CoachShutdownError`. They release local media resources
and leave status idle without invoking the user-facing error callback. The live
session and voice harness suppress that diagnostic type in their disconnect
catches. Rejection still preserves the distinction between local audio stopping
and confirmed provider finalization; no final usage claim is made. Failures
during active coaching remain visible. All 173 tests and both builds pass.


Movement-focused demonstration context: the user is testing with office chairs,
a hand-held bar for pulldowns, and bottles for dumbbells. The shared
`movement-review-context.ts` preference is applied to live/upload analysis and
all voice instructions. Recognizable selected movements are accepted with these
substitutes or without resistance. The model must keep that accommodation out of
feedback and retain normal movement evidence requirements; acceptance is not a
positive form judgment. Seated support checks concern visible torso/hip motion;
missing machine-specific alignment landmarks remain unclear with neutral wording,
without blocking the rest of the assessment or inventing equipment verification.
This adds no UI mode, provider/model change, fabricated findings or fake audio.


Squat-depth capture/assessment update: live frame capture keeps an eight-second
local buffer and preserves at most four actual images around a raw-pose reversal.
Small squat excursions can nominate a review, without locally grading depth or
claiming a joint angle. The retained descent/bottom/ascent can survive a wait for
the single analysis slot; each tracked rep is selected once. Other exercises
continue submitting their recent three-second/four-image view. The recorder can
resolve retained rep segments after rolling-buffer eviction, preserving evidence
replay timestamps. Missing captured bottoms do not become synthetic evidence.

The live/upload depth prompt explicitly evaluates the latest visible turnaround;
standing afterward and good balance/posture cannot establish adequate depth.
`dumbbell_front_squat-4` requires three distinct evidence moments for both positive
and negative squat-depth checks. This is a shared-contract tightening: release
browser/server together and reanalyse older squat reports if their positive depth
check cites fewer than three moments. Reference depth remains visible thighs
approximately parallel, without a measured 90-degree knee-angle claim. Accepted
substitutes do not relax movement-range assessment. Actual user-clip detection
accuracy has not been verified by the synthetic regression tests.

Validation: all 177 tests, TypeScript and both production builds pass. Regression
coverage includes slow and shallow rep timing, bottom-frame selection, missing
bottoms, retained footage after buffer eviction, and rejection of unsupported
positive depth findings as well as unsupported corrections.


Leg-extension follow-up: Person A capture/session now retain lift, furthest
extension and return for leg extensions as well as squats, including small
partial-range candidates. The four-image request cap and existing analysis
schedule are unchanged. Person B live/upload prompts explicitly distinguish
full extension from smoothness, prioritize a supported short-range correction in
the summary, and judge visible hip-knee-ankle alignment at the turnaround.
Practice equipment remains accepted silently. A lift without an observed return
cannot establish incomplete extension.

Shared-contract handoff: `leg_extension-4` now requires three distinct evidence
moments for both positive and negative `full_extension` checks. Release browser
and server together and reanalyse old two-moment positive extension reports.
The local tracker selects real camera evidence only; it does not assign a form
score, invent missing endpoint images, or claim measured joint angles.

Validation: `npm run check` passes all 181 tests, TypeScript and both production
builds. Added regression coverage for small partial extensions, retained endpoint
frames after waiting, stationary noise and unfinished lifts, plus rejection of
positive extension findings without three supporting moments. Real user movement
and spoken detection still need live acceptance testing.


Frontal-squat follow-up: reproduced missed rep timing with synthetic front-facing
geometry; the projected hip/knee/ankle angle remains straight despite a visible
hip dip. Person A rep timing now combines projected knee movement with hip travel
relative to the planted ankle. Torso scale is fixed within each candidate so a
bow alone cannot become a squat, and smaller frontal excursions can nominate
review frames. Return tolerance scales with the candidate excursion to avoid
ending a shallow rep halfway through its rise. This changes evidence timing only,
not local form grading, the reference animation or leg-extension tracking.

Person B live/upload squat instructions explicitly accept partial squat attempts,
consider a clear frontal hip/knee relationship, and do not let planted feet or a
stable rack stand in for adequate depth. Uncertain perspective stays unclear.
Browser coaching text receives the existing typed latest review: same-review
praise mentions unconfirmed depth or retains a known depth correction. Delayed
positive review also discloses unconfirmed depth. Shared evidence schemas and
provider/voice wire interfaces are unchanged.

Validation: `npm run check` passes 185 tests, TypeScript and both production
builds. New frontal partial/full timing regressions failed before the change and
pass afterward, on either visible side. Session integration verifies that the
next available request contains actual captured descent/turnaround/return times.
Negative tests cover a torso bow, camera translation and tracking noise. Report
integration checks the depth qualification in spoken praise. Synthetic geometry
and provider mocks do not establish accuracy on the user's real footage or actual
audio playback; a live retest remains necessary.
