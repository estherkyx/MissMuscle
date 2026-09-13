# Body-tracking model

`pose_landmarker_lite.task` is the unmodified Google MediaPipe Pose Landmarker
Lite float16 model, version 1. It is a public model asset, not a user recording.

- Official source: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
- Documentation: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
- SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`

Keep this file in the built app's `/models/` directory. Body tracking loads it
from the same origin. Vite bundles the WASM binaries and loader sources from the
installed `@mediapipe/tasks-vision` package so their versions always match.
