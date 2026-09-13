# Person A: video review

Implement clip selection and browser frame extraction here. Export frames matching
`AnalysisRequestSchema` in `shared/contracts.ts`; `src/lib/api.ts` owns HTTP calls.

Start with one 5–15-second dumbbell-curl clip. Use 12–16 chronological JPEG frames,
including different movement phases. Longest image edge <= 768px. Use the shared
size limits, detect unsupported codecs, handle metadata/seek errors, and release
object URLs. A prerecorded upload comes before direct camera recording.

Build `VideoReview` with a video element, selected correction, and a handler for
`CoachCommand`. The same handler should power clicks and voice commands. Ignore
unknown correction IDs, reject out-of-clip times, and stop replay at its end time.
Only draw a frame's approximate region while paused at its matching timestamp.
Account for letterboxing and orientation; do not imply continuous tracking.
