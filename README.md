# MissMuscle

An exercise form coach for the **Visual Understanding** and **GPT-Live-1** hackathon tracks.

The demo story: upload a short dumbbell-curl clip → inspect timestamped corrections
and a target-muscle guide → talk to the coach → say **“Wait, show me where you noticed
that”** → the coach brings up the relevant moment and explains the evidence.

## Start here

This is a **working development scaffold**, not the completed AI app.

```sh
npm ci
npm run dev
```

Open http://localhost:5173 and select **Explore a sample report**. No API key is
needed. The sample is fictional and visibly labelled. API requests use the same
origin as the interface. Changes to `server/` reload during local development.

Use Node 22.12+ (the `.nvmrc` selects Node 22). Person B can copy `.env.example` to
`.env` and set `OPENAI_API_KEY` locally when connecting the providers. Restart the
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

What remains: video upload/extraction, visual overlays/reference assets, real Astra
calls, real GPT-Live audio and command handling, comparison, and Sites deployment.
Analysis and voice endpoints intentionally return **501 Not Implemented** until
Person B connects them. A configured key alone does not enable these features.

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
  analysis/analyze.ts        Person B: Astra integration (stub)
  live/create-session.ts     Person B: GPT-Live handshake (stub)
  env.ts                     Server runtime bindings
shared/
  contracts.ts               Shared: single source of truth for interfaces
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
video. The voice backend receives the report and playback context and delegates
further visual questions to Astra when necessary.

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
