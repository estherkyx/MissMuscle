# Movement reference illustrations

Four original AI-generated trainer illustrations for the reference sheets, created
with the built-in imagegen tool on 2026-09-13. These are educational illustrations,
not photographs of a trainer or measured poses. Machine details are illustrative;
follow the equipment's own setup instructions.

Each WebP contains two positions, starting on the left. Captions and accessible
descriptions live in `src/features/review/ExerciseDiagrams.tsx`. The source prompts
are preserved in [prompts.json](prompts.json). PNG outputs were converted to WebP
at quality 85 for local delivery; the app needs no image provider at runtime.

The pulldown image uses matching straight-on front views to keep the trainer's
head, torso, knees, and feet oriented consistently between positions, with the
lowered bar in front of her upper chest. The built-in imagegen
[edit prompts](lat-pulldown-edits.json) are preserved alongside the original prompts.

The illustrations follow the existing exercise variations and visual criteria in
[the source review](../../src/features/review/README.md#full-range-demonstration-review).
They do not share joint geometry with the animated reference and must not be used
as pixel-exact pose targets or assessment thresholds.
