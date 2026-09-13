import type { RefObject } from 'react';
import type { ExerciseId } from '../../../shared/contracts';
import { RecordedMuscleOverlay } from './RecordedMuscleOverlay';
import { LiveMuscleOverlay } from './LiveMuscleOverlay';

export function MuscleOverlay({ videoRef, exerciseId = 'dumbbell_curl', enabled, live = false, onTrackingRate }: {
  videoRef: RefObject<HTMLVideoElement | null>; exerciseId?: ExerciseId; enabled: boolean;
  live?: boolean; onTrackingRate?: (fps: number) => void;
}) {
  return live
    ? <LiveMuscleOverlay videoRef={videoRef} enabled={enabled} live onTrackingRate={onTrackingRate} />
    : <RecordedMuscleOverlay videoRef={videoRef} exerciseId={exerciseId} enabled={enabled} />;
}
