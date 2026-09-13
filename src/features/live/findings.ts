import type { CoachingCue } from './coaching-cue';
import { LIVE_TIMING } from '../../../shared/live-timing';
import { exerciseCriteria } from '../../../shared/exercise-criteria';
import type { AnalysisRequest, LiveInspectionResult, RetainedEvidence, FormCriterionId } from '../../../shared/contracts';
import { segmentsForRange, type RecordingWindow } from './recording';

export const CRITERIA = Object.fromEntries(Object.values(exerciseCriteria).flat().map(criterion => [criterion.id, criterion.title])) as Record<FormCriterionId, string>;
export interface LiveFinding {
  criterionId: FormCriterionId;
  status: 'needs_attention' | 'improved' | 'consistent';
  note: string;
  windowId: string;
  observedThroughSec: number;
}
export interface SavedCorrection {
  criterionId: FormCriterionId;
  result: LiveInspectionResult;
  recording: RecordingWindow;
  evidence: RetainedEvidence[];
  evidenceImages?: { timestampSec: number; dataUrl: string }[];
}
export function mergeFindings(previous: LiveFinding[], result: LiveInspectionResult): LiveFinding[] {
  const criteria=exerciseCriteria[result.report.exerciseId];
  const next = new Map(previous.filter(item=>criteria.some(criterion=>criterion.id===item.criterionId)).map(item => [item.criterionId, item]));
  for (const check of result.report.formChecks ?? []) {
    if (!criteria.some(criterion=>criterion.id===check.criterionId)) continue;
    if (check.status === 'unclear' || !check.evidence.length) continue;
    const observedThroughSec=result.window.startSec+Math.max(...check.evidence.map(e=>e.timestampSec));
    const existing=next.get(check.criterionId);
    if(existing && (observedThroughSec<existing.observedThroughSec ||
      (check.status==='looks_consistent' && observedThroughSec<=existing.observedThroughSec))) continue;
    next.set(check.criterionId, { criterionId: check.criterionId, status: check.status === 'needs_attention' ? 'needs_attention' : existing && existing.status!=='consistent' ? 'improved' : 'consistent', note: check.note, windowId: result.window.windowId, observedThroughSec });
  }
  return [...next.values()];
}
export function retainCorrections(previous: SavedCorrection[], result: LiveInspectionResult, recording: RecordingWindow, frames: AnalysisRequest['frames'] = []): SavedCorrection[] {
  const criteria=exerciseCriteria[result.report.exerciseId];
  const next = new Map(previous.filter(item=>criteria.some(criterion=>criterion.id===item.criterionId)).map(item => [item.criterionId, item]));
  for (const check of result.report.formChecks ?? []) {
    if (!criteria.some(criterion=>criterion.id===check.criterionId)) continue;
    if (check.status !== 'needs_attention' || !check.evidence.length) continue;
    next.delete(check.criterionId);
    const times=check.evidence.map(e=>result.window.startSec+e.timestampSec);
    const startSec=Math.max(recording.startSec,Math.min(...times)-0.75);
    const endSec=Math.min(recording.endSec,Math.max(...times)+0.75);
    const clip={...recording,id:`${recording.id}-${check.criterionId}`,startSec,endSec,
      segments:segmentsForRange(recording.segments,startSec,endSec)};
    next.set(check.criterionId, { criterionId: check.criterionId, result, recording:clip,
      evidenceImages:check.evidence.flatMap(e=>frames[e.frameIndex]?[{timestampSec:e.timestampSec,dataUrl:frames[e.frameIndex].dataUrl}]:[]), evidence: check.evidence.map(evidence => ({ ...evidence, windowId: result.window.windowId, criterionId: check.criterionId })) });
  }
  return [...next.values()].slice(-5);
}
// Evidence uses analysis-window time; replay may be cropped to another start.
export function correctionReplayOffset(correction: SavedCorrection, timestampSec: number) {
  return correction.result.window.startSec + timestampSec - correction.recording.startSec;
}

export function createCuePolicy() {
  let lastSpoken=-Infinity,interruptedAt=-Infinity,lastReassurance=-Infinity;
  const previous=new Map<string,{time:number;status:LiveFinding['status']}>();
  return {
    interrupt(now:number) {interruptedAt=now;},
    select(findings:LiveFinding[],now:number,busy:boolean):CoachingCue|undefined {
      if(busy||now-interruptedAt<5||now-lastSpoken<LIVE_TIMING.cueIntervalSec)return;
      const recent=[...findings].sort((a,b)=>b.observedThroughSec-a.observedThroughSec);
      const fresh=(item:LiveFinding,maxAge:number)=>now>=item.observedThroughSec&&now-item.observedThroughSec<=maxAge;
      const due=(item:LiveFinding)=>{
        const last=previous.get(item.criterionId);
        // A changed assessment should not wait behind the old status's cooldown.
        return !last||last.status!==item.status||now-last.time>=LIVE_TIMING.criterionCooldownSec;
      };
      const correction=recent.find(item=>item.status==='needs_attention'&&fresh(item,LIVE_TIMING.maxEvidenceAgeSec)&&previous.get(item.criterionId)?.status!=='needs_attention');
      if(correction)return {...correction,kind:'correction'};
      // Alternate supported praise and reminders even if speech takes longer
      // than the normal cooldown. Neither should monopolize the whole set.
      const reminder=recent.find(item=>item.status==='needs_attention'&&fresh(item,LIVE_TIMING.nudgeEvidenceAgeSec)&&due(item));
      if(reminder&&Number.isFinite(lastSpoken)&&lastSpoken===lastReassurance)return {...reminder,kind:'nudge'};
      if(now-lastReassurance>=LIVE_TIMING.reassuranceIntervalSec) {
        const positive=recent.find(item=>item.status!=='needs_attention'&&fresh(item,LIVE_TIMING.positiveEvidenceAgeSec)&&due(item));
        if(positive)return {...positive,kind:'reassurance'};
      }
      // Bounded reminders use educational cues, not claims of a new mistake.
      if(reminder)return {...reminder,kind:'nudge'};
    },
    spoken(finding:LiveFinding,now:number) {
      lastSpoken=now;previous.set(finding.criterionId,{time:now,status:finding.status});
      if(finding.status!=='needs_attention')lastReassurance=now;
    },
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
