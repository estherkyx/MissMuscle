# Integration contract v1

`shared/contracts.ts` is authoritative; this document explains its semantics.
Both sides import the types and schemas. All HTTP paths are same-origin.

## Endpoints

| Endpoint | Input | Output | Current behaviour |
| --- | --- | --- | --- |
| `GET /api/health` | None | Capability status | 200; reports configuration, not verified model access |
| `GET /api/demo-report` | None | `AnalysisReport` | 200; always `source: fixture` |
| `POST /api/analyze` | `AnalysisRequest` JSON | `AnalysisReport` | Real Astra image analysis and output validation |
| `POST /api/live/session` | `LiveSessionRequest` JSON | `LiveSessionResponse` | Real GPT-Live WebRTC session with Responses delegation |

Failure envelope: `{ "error": { "code": "INVALID_REQUEST", "message": "..." } }`.
Bad JSON/schema gets 400, wrong content type 415, oversized payload 413, missing
route 404, missing/rejected keys or model access 503, rate/quota limits 429,
provider timeout 504, model refusal 422, and invalid provider output or upstream
failures 502.

## Video → analysis

```ts
type AnalysisRequest = {
  clipId: string;                 // New ID per upload; reject stale responses.
  exerciseId: 'dumbbell_curl' | 'lat_pulldown' | 'leg_extension' | 'dumbbell_front_squat';
  durationSec: number;            // > 0 and <= 15; no units conversion.
  frames: Array<{
    timestampSec: number;         // Strictly increasing, within duration.
    dataUrl: string;              // JPEG data URL; no arbitrary remote URL.
    width: number;
    height: number;
  }>;
};
```

The original clip stays local to the browser. Person A supplies oriented/scaled
frames with the same aspect ratio as the displayed clip. Maximum 16 frames,
768px per edge, 350,000 characters per data URL, and 6 MiB per JSON request.
If the encoded image is too large, lower JPEG quality/size before submitting.
The service checks JPEG boundary bytes and sends the images to Astra; this is not
a full local image decoder. Provider acceptance has been checked with a valid
diagnostic image. Actual exercise footage still needs end-to-end testing.

`frameIndex` is zero-based in this exact request array. The report must carry the
same clip ID, exercise ID, and duration. The server checks that evidence timestamps
match the cited submitted frames within 0.05 seconds. No invented intermediate
frames. The app does not promise to detect movements between sampled frames.

## Analysis → visual review

`AnalysisReport` contains summary, target muscles, visibility, zero to three
corrections, and next-attempt focus. Each correction has a stable ID, priority,
observation, coaching cue, reference cue, and at least one evidence frame.

Additive handoff for Person A: new analyses also return `formChecks`, containing
exactly one entry for each of the selected exercise IDs in `shared/exercise-criteria.ts`. Each has
`criterionId`, `status` (`looks_consistent`, `needs_attention`, or `unclear`), a short
`note`, and `evidence: [{ frameIndex, timestampSec }]`. The server derives times
from the submitted video and validates them. Assessed checks require two distinct
moments, except a visible static wrist check may use one. An unassessable clip must
have all checks unclear. These checks describe visible evidence, not a safety grade.
The field is optional only for compatibility with old reports; missing checks
render as unclear, never as passes. New provider responses must include every criterion for the selected exercise (five for curls, three for each other exercise).

User-facing observations and voice use seconds, not frame numbers. Sampling
limitations should be concise uncertainty statements, not requests for users to
upload images. The review UI places expandable checklist rows beneath corrections;
their timestamp buttons use the existing `seek_video` command. Correction cards expand in place; only explicit timestamp buttons seek. The Reference
Sheet button opens a modal with combined technique and anatomy guidance.

- `source: fixture` is synthetic sample content. Never attach it to uploaded
  footage as real findings or silently use it after a failed provider request.
- `source: astra` means a real analysis result, not a guarantee of accuracy.
- `visibility.assessable: false` requires an empty corrections array. Explain
  what is missing and how the user can improve the recording.
- Zero corrections is also valid for an assessable clip; do not manufacture errors.
- A `region` is either null or a normalized bounding box: top-left `(x, y)` plus
  width/height within `[0,1]`. It refers to the oriented video image, excluding
  letterboxing. It is approximate localization, not a pose skeleton/muscle mask.
- Regions apply to evidence keyframes. Do not interpolate them into a claim of
  continuous tracking. A reference is educational guidance, not a reconstructed
  ideal body pose.

## Visual review ↔ voice adapter

`CoachContext` carries the complete report, `currentTimeSec`, and
`selectedCorrectionId` (nullable). Person A owns state and sends updates to Person
B's `CoachConnection.updateContext()`. End the old session on clip replacement.

`connectCoach(options)` returns a `CoachConnection` with `updateContext` and
`disconnect`. It emits status, transcript entries, and these **app-owned** commands:

```ts
{ type: 'show_correction', correctionId: 'correction-2' }
{ type: 'seek_video', timestampSec: 8 }
{ type: 'pause_video' }
{ type: 'replay_segment', startSec: 6, endSec: 9 }
```

These are not raw OpenAI events. Person B maps documented provider events to them
and validates them with `CoachCommandSchema`. Person A also checks correction IDs
and time bounds against the current report before executing an action.

`show_correction` means pause, select the correction, seek to its first evidence
frame, then display its available annotation and explanation. Both clicking a card
and a voice command invoke this same operation. Reject unknown IDs; never guess.

## App-owned WebRTC handshake

Browser → our server:

```ts
{ sdpOffer: string, context: CoachContext }
```

Our server → browser:

```ts
{ sessionId: string, sdpAnswer: string }
```

Person B translates these into the current upstream API shape. Keep keys server-side.
The voice adapter owns provider connection teardown. If a server close/delegation
route becomes necessary, coordinate it with Person A. The current adapter uses
the data channel's `session.close` and waits for `session.closed` before releasing
the transport, with a bounded timeout that reports unconfirmed finalization.

## Implemented adapter details for Person A

- Call `connectCoach` from a Start button to request microphone access. Await it
  before storing the connection; handle a rejected promise in the UI.
- Optional `onError(message)` gives recoverable audio-playback guidance or failure
  text. Optional `signal: AbortSignal` cancels startup/unmount without changing
  existing callers. These are the only public interface additions.
- Pass the latest context to `updateContext` after selection and playback changes.
  Selection is sent immediately; time updates are throttled to once per second.
  Changing the report/clip requires ending the old session first.
- Transcript callbacks are text fragments, including their original spaces, with
  `final: false`. Append them; do not replace the whole caption or invent a
  completed turn. Speaking/listening status reflects received audio activity.
- Await `disconnect()` from the End button. Mute begins immediately, followed by
  device release after finalization. If the connection fails or closing times out,
  surface the error; local microphone cleanup does not prove final provider usage.
- Abort the startup controller on unmount and also disconnect any resolved
  connection. Cancellation during an in-flight handshake retains the muted
  transport long enough to close a late-created session.
- Tool outputs confirm dispatch to `onCommand`, not completion of browser seeking.
  Keep the UI's context current so the coach can see subsequent playback state.

## Change coordination

Keep schema version `1` during the initial parallel build. Ask the teammate before
renaming fields or changing semantics. Add tests for evidence integrity or
cross-boundary behaviour when those contracts change. Avoid both branches editing
the package lock independently.
