// Shared scheduling/freshness policy, not measured provider performance.
export const LIVE_TIMING = {
  windowSec: 3,
  captureMs: 400,
  maxFrames: 8,
  analysisFrames: 4,
  repBufferSec: 8,
  repBufferFrames: 22,
  firstInspectionSec: 1.2,
  inspectionIntervalSec: 1,
  maxEvidenceAgeSec: 15,
  nudgeEvidenceAgeSec: 20,
  positiveEvidenceAgeSec: 12,
  reassuranceIntervalSec: 6,
  cueIntervalSec: 3,
  criterionCooldownSec: 6,
  analysisTimeoutMs: 45_000,
  analysisTransportGraceMs: 5_000,
} as const;
