# MissMuscle development

Read README.md and the relevant docs/PERSON_A.md or docs/PERSON_B.md handoff.
The selected tracks are Visual Understanding and GPT-Live-1. The initial product
reviews prerecorded dumbbell-curl clips and supports voice discussion of findings.

- Respect the two-person file ownership split. Work primarily in the assigned
  directories; communicate shared contract/dependency changes to the teammate.
- Keep `shared/contracts.ts` as the source of truth. Reuse schemas and types.
- The browser imports `shared/` and `src/`, never provider/server modules.
- Person B owns `src/features/voice/` and `server/`; Person A consumes its typed
  interface and implements playback actions without OpenAI wire-event knowledge.
- Mark fixture data visibly. Never silently substitute canned findings or fake
  audio when a real provider fails. Keep the requested model IDs.
- Evidence timestamps and frame indices must refer to submitted frames. Do not
  assert measured muscle activation or invent precision for body localization.
- Keep production provider code compatible with Web Request/Response/fetch.
  Node-only development helpers belong in `scripts/`.
- Keep credentials and personal demo clips out of Git and browser bundles.
- Run `npm run check` for implementation/integration changes. For documentation
  changes, verify links and instructions rather than adding implementation tests.
- This scaffold is local preparation. Deployment is assigned in the integration
  plan; do not mistake the sample shell for the completed hackathon submission.
