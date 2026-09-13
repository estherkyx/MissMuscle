# Integration, deployment, and demo

> Historical build plan: the public app now supports uploaded review and automatic
> live spoken coaching. Use the [current README](../README.md) for current product
> behavior. The conversational
> uploaded-video demo and future-work description below are superseded.

## Five-hour plan

Times are from the team's build start. Scaffold setup is done; adjust remaining
time to the actual submission deadline.

| Time | Person A | Person B | Shared checkpoint |
| --- | --- | --- | --- |
| 0:00–0:30 | Upload/player shell with sample report | Real Astra + GPT-Live access spike; Sites compatibility | Hear a real voice reply; confirm interfaces |
| 0:30–1:30 | Frame extraction, cards, seek/highlight | Real analysis service + voice adapter | First real clip → real report |
| 1:30–2:30 | Reference/muscle guide, coach controls | Grounded voice + playback command mapping | “Show me where” works end to end |
| 2:30–3:15 | Phone layout and failure states | Deploy complete flow, resolve integration | Hosted analysis and audio both work |
| 3:15–4:00 | Polish evidence display | Test clips and hosted failures | Feature freeze; fix only demo blockers |
| 4:00–5:00 | Record and edit demo together | Record and edit demo together | Submit with time for upload issues |

If behind, cut comparison, a second exercise, and moving overlays. Preserve one
clear evidence-based review and a real voice interaction. An integration failure
must be shown honestly; fixture data is only an explicitly labelled demonstration.

## Merge workflow

Commit/push the shared scaffold before both branch off. Work in separate clones or
worktrees. Person B is the default integrator, owns dependency changes, and merges
small deliverables early. Person A should share a usable playback action handler
before polishing the whole page; Person B should share the working provider adapter
before adding more coach behaviour.

Before each integration checkpoint:

```sh
npm ci
npm run check
npm run dev
```

Use the same short, permissioned test clips: a visible issue, a better attempt, and
an obstructed view. Keep private clips in ignored `demo-private/`, and share them
directly with the teammate. Do not commit personal exercise footage by accident.

## Sites deployment handoff — Person B

The scaffold builds `dist/client/` browser assets and a portable
`dist/worker/index.js` exporting `fetch(request, env)`. `wrangler.jsonc` documents
the Worker/ASSETS shape. **Sites packaging and hosted compatibility are not yet
verified.** A local Vite preview is not a deployed backend.

1. Check the current [Sites workflow](https://learn.chatgpt.com/docs/sites) and its
   supported starter/packaging instructions early. Ask Sites to inspect this
   project and adapt the deployment layer if necessary. Keep shared app contracts.
2. Confirm that the selected Sites runtime can serve the browser assets and `/api/*`
   routes together and can perform the GPT-Live server handshake. The long-lived
   browser audio connection should follow the provider's documented transport.
3. Configure `OPENAI_API_KEY`, `ASTRA_MODEL`, and `LIVE_MODEL` in hosted runtime
   settings. Use Sites secret handling. Local `.env` is not automatically deployed.
   Keep worker code out of public static assets.
4. Reuse any existing `.openai/hosting.json` project ID if present. This scaffold
   has not provisioned a Site or invented a project ID. Follow Sites instructions
   for the exact manifest and archive shape; `wrangler.jsonc` alone is not a Sites
   deployment manifest.
5. Commit/push the integrated source state, build/package that exact state, save a
   Sites version, and deploy it. Use Sites tooling rather than treating
   `wrangler deploy` as a ChatGPT Sites deployment.
6. Verify the final HTTPS URL on the demo phone: file selection, frame analysis,
   evidence seeking, microphone permission, actual audio, interruption, command
   execution, and session teardown. Verify the judges' intended access separately.

The first MVP does not need a database or persistent original-video storage.
Add storage only if the final product behaviour requires it. Sites runtime
settings and publication can differ from local development; reserve time for this.

## Suggested 90-second demo

- **0–10s:** “MissMuscle turns your exercise clip into evidence you can see and a
  coach you can talk to.” Show the deployed app and chosen exercise.
- **10–30s:** Upload the short clip. Show real analysis; edit waiting time honestly
  if needed and do not misrepresent a prerecorded upload as live camera analysis.
- **30–45s:** Click a correction. The player seeks to the evidence and displays
  its annotation, cue, reference, and target-muscle guide.
- **45–70s:** Start a real GPT-Live conversation. Interrupt: “Wait, show me where
  you noticed that.” Show the jump to the evidence and hear the explanation.
- **70–85s:** Show a better attempt if comparison is implemented, otherwise show
  the useful response to an obstructed camera view.
- **85–90s:** Close with the product's current scope and the two selected tracks.

Record a working full-flow take before optional polishing. Preserve real provider
behaviour and show limitations clearly. Continuous live camera coaching is future
work, not part of this prerecorded-clip demo.
