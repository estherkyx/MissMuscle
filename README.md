# MissMuscle

Exercise form review and live spoken coaching for the **Visual Understanding** and
**GPT-Live-1** tracks. The app uses `gpt-6-astra` for sampled-frame analysis and
`gpt-live-1` for spoken guidance. Provider failures are shown explicitly; the public
interface never substitutes fixture findings or fake audio.

## Modes

| Exercise | Uploaded video review | Live exercise |
| --- | --- | --- |
| Dumbbell curl | Supported | Supported; laptop Chrome target |
| Seated overhand front lat pulldown | Supported | Not enabled |
| Seated machine leg extension | Supported | Not enabled |
| Two-dumbbell front squat | Supported | Not enabled |

**Upload a video:** choose an exercise and a clip of up to 15 seconds / 40 MiB.
Analyse it to get exercise-specific corrections and clickable evidence timestamps.
Body mapping prepares the local clip once, then follows playback and seeking with
an approximate body map and a reference demonstrating full target range at the
clip's repetition timing. Reference sheets include exercise and camera guidance.
This mode does not start voice or request microphone access.

**Live exercise:** start the camera for a mirrored preview, local body tracking,
an updating correction list, and automatic spoken guidance. The coach speaks
corrections; users do not need to speak back, and no microphone is captured.
Mute coach silences output. Tracking targets 12–15 updates per second. Starting
after five seconds, the app submits up to 12 ordered frames from the latest
available ten-second window every five seconds when analysis is idle. It allows
one visual request at a time with a 20-second timeout. Repeated findings update
existing cards; automatic cues have a ten-second minimum interval and a
30-second cooldown per criterion. Findings over 15 seconds behind capture are
not spoken as current corrections. Camera and mapping can continue if AI or
voice fails.

**After live exercise:** End session stops capture and voice and opens silent
review of the latest ten seconds and up to five distinct correction clips.
Evidence seeks within its associated recording. Independently recorded segments
form a logical replay timeline, using a format the browser can both record and
play. Recordings contain video only and remain in memory until reset, a new live
session, or leaving the page. There is no cloud recording storage.

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
  and assessment criteria. Live contracts remain curl-only.
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
