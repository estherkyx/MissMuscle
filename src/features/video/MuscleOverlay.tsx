import type { RefObject } from 'react';
import type { ExerciseId } from '../../../shared/contracts';
import { RecordedMuscleOverlay } from './RecordedMuscleOverlay';
import { LiveMuscleOverlay } from './LiveMuscleOverlay';
import type { Landmark } from './muscle-regions';

export function MuscleOverlay({ videoRef, exerciseId = 'dumbbell_curl', enabled, live = false, onTrackingRate, onPose }: {
  videoRef: RefObject<HTMLVideoElement | null>; exerciseId?: ExerciseId; enabled: boolean;
  live?: boolean; onTrackingRate?: (fps: number) => void;
  onPose?: (poses: Landmark[][], width: number, height: number, capturedAtMs: number) => void;
}) {
  return live
    ? <LiveMuscleOverlay exerciseId={exerciseId} videoRef={videoRef} enabled={enabled} live onTrackingRate={onTrackingRate} onPose={onPose} />
    : <RecordedMuscleOverlay videoRef={videoRef} exerciseId={exerciseId} enabled={enabled} />;
}
