export type TranscriptFragment = { role: 'user' | 'coach'; text: string };

// Group adjacent fragments by speaker for readability, without claiming that
// these groups represent completed turns. Preserve spaces supplied by Live.
export function appendTranscript(previous: TranscriptFragment[], entry: TranscriptFragment): TranscriptFragment[] {
  if (!entry.text) return previous;
  const last = previous.at(-1);
  if (last?.role === entry.role) return [...previous.slice(0, -1), { role: entry.role, text: (last.text + entry.text).slice(-20_000) }];
  return [...previous, { role: entry.role, text: entry.text.slice(-20_000) }].slice(-100);
}
