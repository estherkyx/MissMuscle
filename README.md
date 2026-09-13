# MissMuscle

**See what to change in your next rep—and the moment that explains why.**

MissMuscle turns a short exercise video into specific form feedback with clickable
visual evidence. During live exercise, it also speaks feedback so you can keep
your attention on the movement, then lets you replay the moments behind a correction.

Primary track: **Best example of Visual Understanding**. Second track:
**Best use of GPT-Live-1**.

## Why Visual Understanding

The core interaction is **movement → observation → cited moment → next-rep cue**.

- **Reasoning across time:** `gpt-6-astra` receives ordered, timestamped images and
  exercise-specific criteria. For squat depth and leg-extension range, the rubric
  requires evidence of approach, turnaround, and return before judging the endpoint.
  A single mid-rep position cannot establish incomplete range.
- **Inspectable findings:** the model cites submitted frame indices; the server
  derives timestamps from those frames and rejects invalid references. Clicking
  evidence seeks the video to that moment. Live replay also retains the exact
  assessed images. These checks establish traceability, not that every judgment
  is correct.
- **Explicit uncertainty:** each criterion can be `looks_consistent`,
  `needs_attention`, or `unclear`. A hidden body region need not prevent review of
  other visible criteria. An unclear result never becomes positive reassurance.
- **Feedback you can act on:** at most three prioritized corrections connect the
  visible observation to a practical cue and an educational exercise reference.

| Component | Responsibility |
| --- | --- |
| `gpt-6-astra` | Interpret submitted exercise images and return findings with evidence references. |
| Local MediaPipe tracker | Approximate body mapping, movement timing, and selection of live rep evidence. |
| Application code | Validate evidence, derive timestamps, seek/replay, and select timely coaching cues. |
| `gpt-live-1` | Deliver spoken guidance from the selected analysis feedback during live exercise. |
| Reference artwork and muscle colors | Explain the selected exercise and target anatomy; these are educational guides, not model measurements. |

**Try the evidence loop:** upload a short clip, analyse it, select a correction,
and click its evidence timestamps. In live mode, end the session and open
**View the exact moments assessed** for a retained correction.

Provider failures are shown explicitly; the public interface never substitutes
fixture findings or fake audio.

## Modes

| Exercise | Uploaded video review | Live exercise |
| --- | --- | --- |
| Dumbbell curl | Supported | Supported; laptop Chrome target |
| Seated overhand front lat pulldown | Supported | Supported; laptop Chrome target |
| Seated machine leg extension | Supported | Supported; laptop Chrome target |
| Two-dumbbell front squat | Supported | Supported; laptop Chrome target |

**Upload a video:** choose an exercise and a clip of up to 15 seconds / 40 MiB.
Analyse it to get exercise-specific corrections and clickable evidence timestamps.
Body mapping prepares the local clip once, then follows playback and seeking with
an approximate body map and a reference demonstrating full target range at the
clip's repetition timing. Reference sheets include exercise and camera guidance.
This mode does not start voice or request microphone access.

**Live exercise:** start the camera for local body tracking, an updating correction
list, and automatic spoken guidance about reviewed reps. GPT-Live-1 speaks the
selected feedback without requiring the user to speak or granting microphone
access. Visual requests inspect sampled moments; feedback can arrive after the
movement. Camera and mapping can continue if analysis or voice fails.

**After live exercise:** End session opens silent replay of up to ten seconds
ending at the last detected rep, plus up to five distinct correction clips. Select
a correction and expand **View the exact moments assessed** to inspect the images
behind it. When rep tracking is unavailable, replay labels the recent-recording
fallback. Recordings contain video only and remain in browser memory until reset,
a new live session, or leaving the page; there is no cloud recording storage.

See [live coaching and replay mechanics](docs/LIVE_WORKFLOW.md) for sampling,
evidence timing, cue freshness, audio recovery, and recording behavior.

Muscle colors are **educational target-muscle guidance**, not measured activation,
a safety score, or a diagnosis. Tracking and reference timing are approximate;
missing joints or multiple people can prevent reliable mapping.

## Run locally

Use Node 22.12+ (`.nvmrc` selects Node 22).

```sh
npm ci
cp .env.example .env
# Set OPENAI_API_KEY in .env for analysis and spoken coaching.
npm run dev
```

Open http://localhost:5173. Reference sheets and local body mapping do not need a
provider key. Restart the dev server after changing environment variables.
Keep credentials and personal exercise clips out of Git. Never place credentials
in `VITE_*` variables, which can reach browser bundles.

MediaPipe 0.10.32, its WASM, and the pose model are packaged with the app; tracking
does not depend on a runtime CDN. Both mapping modes use a worker with GPU/CPU
fallback. See [model asset notes](public/models/README.md).

```sh
npm run check
npm run preview
```

`check` runs credential-independent tests, TypeScript checks, and browser/server
production builds. Preview serves the built interface with the local API adapter;
it is not a hosted Worker runtime test.

## Integration and ownership

Person A owns mode selection, capture, mapping, recording, and review. Person B
owns `server/` and `src/features/voice/`, including provider events and transport.
Shared schemas and types live in `shared/contracts.ts`; coordinate changes through
[Person A's handoff](docs/PERSON_A.md) and [Person B's handoff](docs/PERSON_B.md).

- `src/features/video/`: extraction, worker tracking, uploaded reference scans.
- `src/features/live/`: camera lifecycle, analysis scheduling, correction policy,
  recording buffer, and replay.
- `src/features/review/`: findings, reference sheets, and exercise diagrams.
- `src/features/voice/`: typed coach adapter; live guidance uses `guidanceOnly: true`
  and silent transport audio rather than microphone capture.
- `shared/exercises.ts` and `shared/exercise-criteria.ts`: four-exercise catalogue
  and assessment criteria. Live contracts support all four exercises and bind findings to the selected exercise.
- `server/`: portable Web Request/Response handlers and real provider integration.
- `scripts/dev-api.ts`: Node-only local API bridge.
- `dist/client/` and `dist/worker/index.js`: generated browser assets and server bundle.

Same-origin endpoints include `/api/analyze`, `/api/live/analyze`,
`/api/live/session`, and `/api/health`. Health configuration does not prove model
access. Analysis sends selected JPEG frames, not the original video; uploaded
requests support 2–16 ordered frames with a maximum 768-pixel edge. See the
[API contract](docs/CONTRACT.md) and [exercise handoff](docs/EXERCISES.md).

The separate [development voice harness](src/features/voice/dev.html) retains a
conversational interface and a visibly fictional report unless a real report is
imported. It is not the public uploaded-review workflow.

## Validation and remaining work

Local verification on 13 September 2026: `npm run check` passed **185 tests**,
TypeScript checks, and browser/server production builds. This verifies software
behavior; real exercise accuracy and current end-to-end audio still need demo
evidence. No hosted demo or recording is linked here yet.

Automated checks cover contracts, evidence validation, analysis boundaries,
reference scanning, correction suppression, recording/replay lifecycle, and voice
adapter behavior. Actual camera/provider acceptance remains necessary, including
permission denial, missing/multiple poses, audio output, slow requests, mode
changes during startup, and replay across recording boundaries after buffer expiry.
Tracking rate, spoken-cue delay, session cost, and end-to-end latency have not been
established by these automated checks. Do not describe them as measured performance.

Mobile optimisation, full-workout recording, and deployment are outside this live
implementation. See [verification status](docs/PERSON_B_STATUS.md) and the
[original integration plan](docs/INTEGRATION.md) for background; earlier plans for
uploaded voice discussion have been superseded by the mode behavior above.
