import type { Landmark } from './muscle-regions';
import { referenceSpatialPose, projectReferencePoint } from './reference-spatial';

// Compatibility entry point. Progress is extension (0) to curl (1), not a cycle.
export function referenceCurlPose(progress: number): Landmark[] {
  return referenceSpatialPose('dumbbell_curl',progress).map(p=>projectReferencePoint(p,-Math.PI/2));
}
