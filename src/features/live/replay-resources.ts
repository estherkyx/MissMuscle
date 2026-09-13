import type { RecordingWindow } from './recording';

// Allocate inside the React effect, not during render/useMemo. Every setup gets
// new URLs, including Strict Mode's setup → cleanup → setup cycle.
export function createReplayResources(recording: RecordingWindow, api = URL) {
  const urls = new Map(recording.segments.filter(segment => segment.blob?.size).map(segment => [segment.id, api.createObjectURL(segment.blob!)]));
  let released = false;
  return {
    urls,
    release() {
      if (released) return;
      released = true;
      urls.forEach(url => api.revokeObjectURL(url));
    },
  };
}
