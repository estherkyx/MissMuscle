// Authored demonstration timing, independent of the user's pose or repetition.
export function referenceLoopProgress(elapsedMs: number): number {
  const phase=Math.max(0,elapsedMs)%4000;
  return (1-Math.cos(phase*Math.PI/2000))/2;
}
