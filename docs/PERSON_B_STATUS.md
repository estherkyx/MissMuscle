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
