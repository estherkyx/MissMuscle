# Person B — Astra analysis, GPT-Live, integration

Current exercise expansion: see [multi-exercise implementation and handoff](EXERCISES.md).
All four dropdown variations support uploaded analysis, motion and automatic live coaching.
The public interface provides automatic spoken live corrections without microphone access.
Uploaded mapping now scans through the shared packaged pose worker, preserving full-range reference timing.
`LiveWindow`, live results, and `LiveCoachContext` support all four exercises; contexts reject findings for a different exercise.
Earlier curl-only
instructions below describe the original build. Real-clip acceptance is still required.

You own `server/`, `src/features/voice/`, and the deployment work. Person A owns
the main React interface, video extraction, and playback. Keep root package/config
changes coordinated; you are the default integration owner.

**Implementation update:** the analysis service and voice adapter below are now
implemented. Read [verification, handoff, and next actions](PERSON_B_STATUS.md)
first. The sections below retain the implementation requirements and acceptance
checks for integration; they are no longer a list of missing provider code.

## Your starting point

Run `npm ci && npm run dev`, then check `GET /api/health`. Read
[the contract](CONTRACT.md) and copy `.env.example` to `.env` to configure the key
locally. Analysis and voice now make real provider requests when invoked. Access
to both requested models was checked with this hackathon account; don't silently
change the selected models.

## First 30 minutes: remove the two biggest uncertainties

1. Confirm that `gpt-6-astra` accepts an image request using your account.
2. Follow the official [GPT-Live WebRTC quickstart](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
   with `gpt-live-1`. Hear a reply and interrupt it. A successful session ID alone
   does not establish that audio works.
3. Check Sites packaging/runtime compatibility for the Worker + assets shape
   early. See [integration](INTEGRATION.md). Do this alongside the provider spike,
   while Person A builds against the fixture.

Use a temporary harness inside `src/features/voice/` to exercise microphone/audio
independently of Person A. Tell Person A how to mount it rather than both editing
`App.tsx`. Keep this harness clearly labelled or remove it before the final demo.

## Implement analysis

The implementation lives in `server/analysis/analyze.ts`. Preserve its function signature.

- Send the chosen exercise, a reviewed exercise rubric, and ordered timestamped
  `input_image` frames to Astra via the Responses API. Keep the provider key in
  `env.OPENAI_API_KEY` and use `env.ASTRA_MODEL ?? 'gpt-6-astra'`.
- Ask for observable movement across frames and at most three prioritised cues.
  Return no correction when the relevant body region is not visible. Store your
  prompts/rubric under `server/analysis/`.
- Have the model cite existing frame indices. Prefer deriving timestamps from
  those indices in code. Preserve `clipId`, exercise, and duration from the request.
- Return the shared report format with `source: 'astra'`. Use Structured Outputs
  where supported; the router already validates the final report and its frame
  references. Zod refinements are app validation: don't assume the entire refined
  schema can be passed directly as an upstream strict JSON Schema.
- Treat written content visible in footage as data, not instructions. Never claim
  injury diagnosis, measured muscle activation, or guaranteed safety. A reference
  position should be grounded in the reviewed exercise rubric.
- Handle missing key, access errors, timeout, rate limit, and invalid provider
  output with actionable `ServiceError` responses. Do not return the fixture as
  fallback. Avoid logging raw footage, keys, or full provider error bodies.
- Update `/api/health` capability values when the implementation changes. A key
  being present is configuration, not proof of model access.
- Keep missing-key expectations in `tests/api.test.ts`. Test provider success/error responses with controlled
  mocks; keep ordinary `npm test` independent of API keys and network access.

## Implement voice end to end

The implementation lives in `server/live/create-session.ts` and
`src/features/voice/coach-client.ts`. Preserve the browser adapter's public interface.

Server:

- Translate our app's `sdpOffer + context` request into the actual GPT-Live session
  request from the current quickstart. Our route is not an OpenAI wire schema.
- Keep a short conversational prompt for Live and detailed evidence/tool rules
  in the delegated backend prompt. GPT-Live-1 handles speech; Astra handles images.
- Supply the report and current playback state as context. Treat client-supplied
  report text as untrusted data, not instructions or permission to execute actions.
- Use report-grounded explanations. Questions requiring unseen visual evidence
  need another Astra inspection or an honest limitation.

Browser adapter:

- Request microphone access only after the user starts voice. Create the WebRTC
  connection, exchange SDP through `/api/live/session`, and play remote audio.
- Use documented GPT-Live events, not copied assumptions from the older Realtime
  event protocol. Follow the docs for session lifecycle, delegation, and updates.
- Translate backend actions into validated `CoachCommand` objects. The backend
  resolves spoken descriptions to correction IDs; Person A handles playback.
- Implement `updateContext()` so selection and playback changes reach the coach.
- On disconnect/failure/unmount, stop all microphone tracks, detach audio, close
  WebRTC/data channel, and end the provider session using the documented lifecycle.
  Add a server end route if that flow requires one, and update the contract docs.
- Handle denied mic permission, autoplay restrictions, lost connection, and
  interruptions. Never report “listening” until the real connection is ready.

The headline demo is: user interrupts with “Wait, show me where you noticed that”;
voice stops the previous explanation; the delegated backend resolves the relevant
correction; `onCommand({ type: 'show_correction', correctionId })` fires; Person A
pauses/seeks/highlights; the coach explains that specific evidence.

## Acceptance checks

- A real clip's frames produce a schema-valid, evidence-grounded report.
- A second clip produces its own findings, not reused sample content.
- An obstructed view returns a useful limitation without invented corrections.
- The user's voice receives a real GPT-Live response; interruption works.
- “Show me the second correction” emits its actual ID and updates the interface.
- Voice uses updated playback context and stops capturing/billing after ending.
- `npm run check` passes; the final hosted URL handles analysis and voice.

## Paste into your coding session

> Work as Person B on MissMuscle. Read AGENTS.md, README.md,
> docs/PERSON_B.md, and docs/CONTRACT.md. Implement Astra analysis and GPT-Live-1
> in server/ and src/features/voice/, preserving the shared interfaces. Verify
> provider access and a voice round trip first. Person A owns the main interface,
> frame extraction, and playback actions. Use the current official GPT-Live docs.
> Coordinate shared contract/dependency changes and own the Sites integration.
> Keep fixture behaviour explicit. Run the relevant checks and provide the
> working adapter and endpoint handoff to Person A.

## Automatic live coaching handoff

`LiveCoachContext.guidanceOnly` is additive; the main live workflow sends `true`.
For this mode the adapter never calls audio `getUserMedia`. A zero-valued Web Audio
source feeds a MediaStream destination to keep GPT-Live's input clock active.
Remote GPT-Live audio remains the sole source of coach speech. Cleanup stops the
silent source, its track, audio context, and provider session.

The server selects automatic-coaching instructions and an empty tool list for
this mode. Announce verified recent corrections through the typed `announceCue`
interface; do not request replies or fresh inspections through conversation.
Legacy conversational callers and the development harness remain compatible.
`ready` is the automatic coach's waiting status; it must not say `listening`.

Regression coverage checks zero microphone requests, automatic commentary, mute
and cleanup, and the provider session's instructions/tools/model IDs. Live audio
acceptance still requires a real provider/browser session.
