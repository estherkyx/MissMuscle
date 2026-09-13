# Person A — video and visual experience

Current exercise expansion: see [multi-exercise implementation and handoff](EXERCISES.md).
All four dropdown variations support uploaded analysis and motion; live coaching remains curl-only.
The public interface provides automatic spoken live corrections without microphone access.
Uploaded mapping now scans through the shared packaged pose worker, preserving full-range reference timing.
`LiveWindow`, live results, and `LiveCoachContext` reject other exercises; uploaded contracts retain all four.
Earlier curl-only
instructions below describe the original build. Real-clip acceptance is still required.

You own `src/App.tsx`, `src/styles.css`, `src/features/video/`,
`src/features/review/`, and `public/`. Person B owns `src/features/voice/`.

## Your starting point

Run `npm ci && npm run dev`. The sample report works without a provider key.
Read [the contract](CONTRACT.md). Use `demoReport` to build the report layout;
the fixture is not an assessment of a user-supplied clip.

## Build in this order

1. **Select and play a clip.** Add a file picker, size/duration checks, metadata
   loading, and a video element. Restrict the first flow to dumbbell curl. Handle
   unsupported codecs clearly; do not assume every phone MOV will decode.
2. **Extract frames.** Use a separate offscreen video/canvas. Await `loadedmetadata`
   and each `seeked` event with timeout/error handling. Sample 12–16 chronological
   frames through the whole movement, keeping the endpoint slightly before the
   exact duration. Export scaled JPEGs using `LIMITS`. Revoke object URLs and
   cancel an obsolete extraction if the user replaces the clip.
3. **Call `analyzeClip()` from `src/lib/api.ts`.** Generate a new `clipId` per upload.
   Show extraction, analysis, failure, and retry states. Ignore responses whose
   `clipId` no longer matches the active clip. The endpoint now calls real Astra
   when the server key is configured. See [Person B's handoff](PERSON_B_STATUS.md).
4. **Show the evidence.** Selecting a correction pauses and seeks to its first
   evidence timestamp, then shows its observation and cue. Draw the normalized
   region only at the matching paused keyframe. Null region means no box. Fit
   annotations to the actual image bounds, excluding letterboxing. Show a
   reviewed reference alongside the frame and label it as a reference.
5. **Add the target-muscle guide.** Use a simple reviewed diagram for the supported
   exercise. Label it “Target muscles”. A separate diagram is sufficient; use
   approximate keyframe overlays only when localization is credible.
6. **Connect the coach controls.** Import `connectCoach` from Person B's adapter.
   Render start/end controls, status, transcript, and useful errors. Route
   `onCommand` through the same handler used by the correction cards.

## Voice integration boundary

Person B supplies this implementation:

```ts
const connection = await connectCoach({
  context: { report, currentTimeSec: video.currentTime, selectedCorrectionId },
  onStatus: setCoachStatus,
  onTranscript: appendTranscript,
  onCommand: handleCoachCommand,
});
```

Your `handleCoachCommand` supports:

- `show_correction`: verify the ID, pause, select that correction, and seek to its
  first evidence frame. This is the “show me where” demo moment.
- `seek_video`: validate against the active clip duration, then seek.
- `pause_video`: pause immediately.
- `replay_segment`: validate start/end, play the segment, and pause at its end.

Do not map “the second correction” yourself; the voice backend resolves the
spoken reference to a stable correction ID. Validate commands before using them.
Use an explicit development-only command simulator to test without working voice.
Do not present that simulator as GPT-Live.

Call `connection.updateContext()` when selection changes, after a seek, and at a
throttled rate during playback. End the old session before changing the active
clip/report. Call `disconnect()` on end/unmount, ensuring setup cannot create
duplicate sessions under React Strict Mode. Person B owns media cleanup inside
the adapter. Handle a connection finishing after its component has unmounted.

## Acceptance checks

- A short phone clip loads and produces ordered, schema-valid frames.
- Each correction seeks to its real evidence and is legible on a phone screen.
- Regions align on portrait and landscape clips, including letterboxing.
- Unassessable clips show the visibility explanation with no invented corrections.
- Fixture mode stays explicit; uploaded footage never inherits sample findings.
- Typed simulated voice commands select the same evidence as a click.
- API failure, oversized/long/unsupported input, and clip replacement are handled.

## Paste into your coding session

> Work as Person A on MissMuscle. Read AGENTS.md, README.md,
> docs/PERSON_A.md, and docs/CONTRACT.md. Implement the video/visual workstream in
> your owned directories. Use shared contracts and the labelled sample report so
> you can work independently of the backend. Build the playback command handler
> that supports “show me where you noticed that”. Person B owns server/ and
> src/features/voice/. Coordinate changes to shared contracts and package files.
> Finish by running the relevant checks and reporting the handoff interface.

## Automatic live coaching and replay handoff

The main interface has separate upload and live modes. Upload review keeps
timestamp seeking and does not mount voice controls. Live mode uses automatic
spoken guidance with `guidanceOnly: true`; its UI must not ask the user to speak
or request microphone access. Person B owns the silent voice transport.

Replay object URLs are allocated and released together inside the React effect
in `SessionReplay`, through `createReplayResources`. Do not allocate these URLs
in render or `useMemo`: Strict Mode cleanup would revoke URLs reused by the next
effect setup. The recorder selects a jointly recordable/playable MIME type and
retains the actual recorder MIME type. Keep recorded frames and evidence offsets
in source orientation; only live camera/body-map presentation is mirrored.
