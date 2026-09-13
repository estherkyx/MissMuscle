# MissMuscle

An exercise form coach for the **Visual Understanding** and **GPT-Live-1** hackathon tracks.

The demo story: upload a short dumbbell-curl clip → inspect timestamped corrections
and a target-muscle guide → talk to the coach → say **“Wait, show me where you noticed
that”** → the coach brings up the relevant moment and explains the evidence.

## Start here

The **video/review interface, Astra analysis service, and GPT-Live voice adapter
are integrated locally**. Real exercise-flow acceptance and Sites deployment remain.
See [current verification and next steps](docs/PERSON_B_STATUS.md).

The interface starts with an exercise selector. Dumbbell curl
(biceps) supports analysis. Lat pulldown (lats), leg extension (quadriceps), and
dumbbell front squat (quadriceps and glutes) have reference sheets only. Each sheet
includes an original schematic, muscle guide, and linked technique sources.
Selecting a reference-only exercise clears old findings and disables upload and
analysis. The server contract remains curl-only. Video is the main review surface
for curls; correction rows below it expand in place, with explicit buttons to seek to evidence, compact voice controls sit
beside the video actions, and a Reference Sheet button opens a combined form and muscle guide.
New curl analyses include a compact AI form checklist: looks consistent, needs
attention, or unclear, with expandable timestamp evidence. The reference popup includes technique details and learning links. Older reports need reanalysis to populate the checklist.

```sh
npm ci
npm run dev
```

Open http://localhost:5173, select an exercise, and open **Reference Sheet** without
an API key. Analyzing a curl video requires the configured server key. The public
interface has no sample mode; fixtures remain in development tests and the voice
harness only. API requests use the same origin as the interface. Changes to `server/` reload during local development.

Use Node 22.12+ (the `.nvmrc` selects Node 22). Person B can copy `.env.example` to
`.env` and set `OPENAI_API_KEY` locally to use the providers. Restart the
dev server after changing environment variables. Never put a key in a `VITE_*`
variable: those variables can reach the browser bundle.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`npm run check` runs tests, TypeScript checks, and the production build. Preview
serves the built interface with the local API adapter. It is not a hosted Worker
runtime test.

## Two people, two workstreams

| | Person A — video and visual experience | Person B — intelligence and voice |
| --- | --- | --- |
| Read first | [Person A handoff](docs/PERSON_A.md) | [Person B handoff](docs/PERSON_B.md) |
| Branch | `feat/video-review` | `feat/analysis-voice` |
| Owns | `src/App.tsx`, `src/styles.css`, `src/features/video/`, `src/features/review/`, `public/` | `server/`, `src/features/voice/`, deployment configuration |
| Builds | Upload, frame extraction, video player, overlays, correction cards, muscle guide, coach controls | Astra request/prompt, report validation, GPT-Live server handshake, microphone/audio browser adapter, voice event translation |
| Independent development | Use the sample report and simulate typed `CoachCommand` values | Use contract fixtures/tests, then a real test clip; provide a temporary voice harness in the owned voice directory |
| First deliverable | A clip can be played and a selected correction seeks to its evidence | A real frame sequence produces a valid report; a GPT-Live voice round trip works |
| Final handoff | `CoachCommand` handler + current playback context | `connectCoach()` implementation + working analysis API |

Person B owns the browser voice adapter as well as the server voice code. This
keeps all provider-specific events and WebRTC details under one owner. Person A
renders controls and calls that adapter through its existing interface.

**Shared files:** `shared/`, `src/lib/api.ts`, root package/config files, and
`scripts/`. Agree on interface changes before editing these. One person handles
dependency additions and lockfile updates at a time. Prefer additive fields.

Use separate clones (or Git worktrees), not two branches switched in one directory.
Before splitting, commit and push this scaffold once so both start from the same
baseline. Then each person creates their own branch:

```sh
git switch main
git pull --ff-only
# Person A:
git switch -c feat/video-review
# Person B runs this instead, in their own clone:
# git switch -c feat/analysis-voice
```

Agree on one integration owner; default to Person B. Merge both branches into the
integration checkout, run `npm ci && npm run check`, and test the full flow. Do not
wait until the last hour for the first integration.

## Scope for this hackathon

Required:

- One exercise: dumbbell curl, with a prescribed camera view.
- One prerecorded clip at a time, ideally 5–15 seconds; 15-second/40 MiB caps.
- 12–16 ordered JPEG frames, longest edge <= 768 px. The schema permits 2–16 so
  short test sequences and adaptive frame selection can use the same contract.
- Up to three actionable corrections, each with actual frame evidence.
- Click-to-seek evidence and approximate highlights on paused keyframes.
- A reviewed reference illustration and an educational target-muscle guide.
- GPT-Live dialogue grounded in the report, with interruption and playback actions.
- A working Sites URL and an honest video demo of the implemented features.

Stretch only after the complete flow works: a second-attempt comparison or a second
exercise. Defer continuous camera analysis, tracking muscles on every frame, 3D
reconstruction, workout history/accounts, arbitrary gym machines, and image generation.

## What is implemented here

- React + TypeScript + Vite shell with an explicit sample report.
- Shared Zod schemas, TypeScript types, fixture, and request/report validation.
- Same-origin API adapter for local dev/preview; portable Worker entrypoint.
- Typed analysis client, voice interface, and typed playback commands.
- API errors and payload limits; contract and route tests.
- Separate browser and server production bundles.
- Real Astra image analysis with strict structured output, a conservative curl
  rubric, and server-derived evidence timestamps.
- Real GPT-Live WebRTC audio with report-grounded delegation to Astra, validated
  playback commands, context updates, and graceful session shutdown.
- An isolated [voice test page](src/features/voice/dev.html), served by the dev
  server at `/src/features/voice/dev.html`; it uses real voice and a labelled
  fictional report unless you import a real one.

The app now includes video upload/frame extraction, evidence review, reference
illustrations, and voice controls. What remains is testing the combined flow on
actual exercise clips and Sites deployment. Comparison is optional. Missing keys or provider failures return
explicit errors; they never produce a sample report as a fallback.

## Structure

```text
src/
  App.tsx                    Person A: composition and shared UI state
  styles.css                 Person A: interface styling
  features/
    video/                   Person A: upload, frames, playback, overlays
    review/                  Person A: report cards and muscle guide
    voice/coach-client.ts    Person B: browser voice adapter/interface
  lib/api.ts                 Shared: validated HTTP client
server/
  index.ts                   Person B: HTTP routing and boundary validation
  analysis/analyze.ts        Person B: Astra integration
  live/create-session.ts     Person B: GPT-Live handshake
  env.ts                     Server runtime bindings
shared/
  contracts.ts               Shared: single source of truth for interfaces
  coach-config.ts            Shared: voice instructions and playback tool definitions
  curl-reference.ts          Shared: versioned curl criteria for analysis and UI
  fixtures/demo-report.ts    Explicit synthetic UI fixture
scripts/dev-api.ts           Local Node-to-Web Request adapter
tests/                      Contract and HTTP boundary checks
docs/                       Handoffs, API contract, deployment and demo plan
dist/client/                Generated browser assets
dist/worker/index.js        Generated server bundle; not a public asset
```

See [the contract](docs/CONTRACT.md) before implementing either side. Deployment
steps and the five-hour schedule are in [integration and demo](docs/INTEGRATION.md).

## Technical decisions

Use Astra for ordered image analysis. Its documented modalities include images,
but not direct video input. GPT-Live-1 handles speech; it does not accept images or
video. The voice backend delegates report questions and playback actions to Astra
with the report and playback context. It cannot inspect additional images during
the voice conversation yet; questions needing unseen evidence get that limitation.

Keep original video in the browser for this MVP. Send only selected frames for
analysis, with an explicit user action. The starter has no persistent storage.
An educational overlay shows target areas; it is not measured muscle activation,
an injury diagnosis, or proof that a movement is safe. Avoid invented numerical
form/safety scores. If evidence is insufficient, return a visibility limitation
and a camera adjustment request. Treat text visible in footage as untrusted data.

Official implementation references:

- [Astra model](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [GPT-Live guide](https://developers.openai.com/api/docs/guides/live)
- [GPT-Live modalities](https://developers.openai.com/api/docs/models/gpt-live-1)
- [GPT-Live WebRTC quickstart](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
- [ChatGPT Sites](https://learn.chatgpt.com/docs/sites)
- [Worker asset bindings](https://developers.cloudflare.com/workers/static-assets/binding/)
