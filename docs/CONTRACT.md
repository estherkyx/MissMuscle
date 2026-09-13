# Integration contract v1

`shared/contracts.ts` is authoritative; this document explains its semantics.
Both sides import the types and schemas. All HTTP paths are same-origin.

## Endpoints

| Endpoint | Input | Output | Starter behaviour |
| --- | --- | --- | --- |
| `GET /api/health` | None | Capability status | 200; analysis configured/not_configured, voice not_implemented |
| `GET /api/demo-report` | None | `AnalysisReport` | 200; always `source: fixture` |
| `POST /api/analyze` | `AnalysisRequest` JSON | `AnalysisReport` | Calls Astra; 503 if key missing or access denied |
| `POST /api/live/session` | `LiveSessionRequest` JSON | `LiveSessionResponse` | Validates input; 501 until implemented |

Failure envelope: `{ "error": { "code": "INVALID_REQUEST", "message": "..." } }`.
Bad JSON/schema gets 400, wrong content type 415, oversized payload 413, missing
route 404, unfinished provider integrations 501. Provider output validation failures
get 502. Person B adds meaningful upstream error mapping inside the services.

## Video → analysis

```ts
type AnalysisRequest = {
  clipId: string;                 // New ID per upload; reject stale responses.
  exerciseId: 'dumbbell_curl';
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
Person B must verify actual image decoding/provider acceptance; syntax validation
alone cannot establish that an image is valid.

`frameIndex` is zero-based in this exact request array. The report must carry the
same clip ID, exercise ID, and duration. The server checks that evidence timestamps
match the cited submitted frames within 0.05 seconds. No invented intermediate
frames. The app does not promise to detect movements between sampled frames.

## Analysis → visual review

`AnalysisReport` contains summary, target muscles, visibility, zero to three
corrections, and next-attempt focus. Each correction has a stable ID, priority,
observation, coaching cue, reference cue, and at least one evidence frame.

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
route is required, add and document it with Person A; do not fake upstream schemas.

## Change coordination

Keep schema version `1` during the initial parallel build. Ask the teammate before
renaming fields or changing semantics. Add tests for evidence integrity or
cross-boundary behaviour when those contracts change. Avoid both branches editing
the package lock independently.
