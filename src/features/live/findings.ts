import type { LiveInspectionResult, RetainedEvidence } from '../../../shared/contracts';
import type { RecordingWindow } from './recording';

export const CRITERIA = {
  steady_upper_arm: 'Upper arms', neutral_wrist: 'Hands and wrists', steady_torso: 'Torso',
  relaxed_shoulders: 'Shoulders', controlled_movement: 'Movement control',
};
function isCurlCriterion(id: string): id is keyof typeof CRITERIA { return Object.hasOwn(CRITERIA, id); }
export interface LiveFinding {
  criterionId: keyof typeof CRITERIA;
  status: 'needs_attention' | 'improved';
  note: string;
  windowId: string;
  observedThroughSec: number;
}
export interface SavedCorrection {
  criterionId: keyof typeof CRITERIA;
  result: LiveInspectionResult;
  recording: RecordingWindow;
  evidence: RetainedEvidence[];
}
export function mergeFindings(previous: LiveFinding[], result: LiveInspectionResult): LiveFinding[] {
  const next = new Map(previous.map(item => [item.criterionId, item]));
  for (const check of result.report.formChecks ?? []) {
    if (!isCurlCriterion(check.criterionId)) continue;
    if (check.status === 'unclear') continue;
    if (check.status === 'looks_consistent' && !next.has(check.criterionId)) continue;
    next.set(check.criterionId, { criterionId: check.criterionId, status: check.status === 'needs_attention' ? 'needs_attention' : 'improved', note: check.note, windowId: result.window.windowId, observedThroughSec: result.window.startSec + result.report.durationSec });
  }
  return [...next.values()];
}
export function retainCorrections(previous: SavedCorrection[], result: LiveInspectionResult, recording: RecordingWindow): SavedCorrection[] {
  const next = new Map(previous.map(item => [item.criterionId, item]));
  for (const check of result.report.formChecks ?? []) {
    if (!isCurlCriterion(check.criterionId)) continue;
    if (check.status !== 'needs_attention' || !check.evidence.length) continue;
    next.delete(check.criterionId);
    next.set(check.criterionId, { criterionId: check.criterionId, result, recording, evidence: check.evidence.map(evidence => ({ ...evidence, windowId: result.window.windowId, criterionId: check.criterionId })) });
  }
  return [...next.values()].slice(-5);
}
export function createCuePolicy() {
  let lastSpoken = -Infinity;
  let interruptedAt = -Infinity;
  const byCriterion = new Map<string, number>();
  return {
    interrupt(now: number) { interruptedAt = now; },
    select(findings: LiveFinding[], now: number, busy: boolean): LiveFinding | undefined {
      if (busy || now - interruptedAt < 5 || now - lastSpoken < 10) return;
      return findings.find(item => item.status === 'needs_attention' && now - item.observedThroughSec <= 15 && now - (byCriterion.get(item.criterionId) ?? -Infinity) >= 30);
    },
    spoken(finding: LiveFinding, now: number) { lastSpoken = now; byCriterion.set(finding.criterionId, now); },
  };
}

// A question replaces the next periodic inspection; at most one question waits.
export function createInspectionQueue<T>(run: (question?: string) => Promise<T>) {
  let running = false;
  let stopped = false;
  let pending: { question: string; resolve: (result: T) => void; reject: (error: Error) => void } | null = null;
  async function execute(question?: string): Promise<T> {
    running = true;
    try { return await run(question); }
    finally {
      running = false;
      if (!stopped && pending) {
        const next = pending; pending = null;
        void execute(next.question).then(next.resolve, next.reject);
      }
    }
  }
  return {
    periodic(): Promise<T | undefined> { return stopped || running || pending ? Promise.resolve(undefined) : execute(); },
    inspect(question: string): Promise<T> {
      if (stopped) return Promise.reject(new Error('Session ended.'));
      if (!running) return execute(question);
      pending?.reject(new Error('A newer question replaced this inspection.'));
      return new Promise((resolve, reject) => { pending = { question, resolve, reject }; });
    },
    stop() { stopped = true; pending?.reject(new Error('Session ended.')); pending = null; },
  };
}
