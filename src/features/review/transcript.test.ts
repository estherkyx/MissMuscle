import test from 'node:test';
import assert from 'node:assert/strict';
import { appendTranscript, type TranscriptFragment } from './transcript';

test('Live fragments accumulate without losing words, spaces, or speaker changes', () => {
  let entries: TranscriptFragment[] = [];
  for (const entry of [
    { role: 'coach', text: 'Keep your' }, { role: 'coach', text: ' wrist aligned.' },
    { role: 'user', text: 'Wait, ' }, { role: 'user', text: 'show me where.' },
    { role: 'coach', text: 'At eight seconds.' },
  ] as const) entries = appendTranscript(entries, entry);
  assert.deepEqual(entries, [
    { role: 'coach', text: 'Keep your wrist aligned.' },
    { role: 'user', text: 'Wait, show me where.' },
    { role: 'coach', text: 'At eight seconds.' },
  ]);
});
