import type { AnalysisReport, AnalysisRequest, Correction } from '../../../shared/contracts';

export function EvidenceOverlay({ report, request, correction, evidenceIndex, visible }: {
  report: AnalysisReport | null; request: AnalysisRequest | null; correction: Correction | undefined; evidenceIndex: number; visible: boolean;
}) {
  const evidence = correction?.evidence[evidenceIndex];
  const frame = report?.source === 'astra' && request?.clipId === report.clipId && evidence ? request.frames[evidence.frameIndex] : null;
  if (!visible || !frame || !evidence?.region) return null;
  const { x, y, width, height } = evidence.region;
  // Match the video's object-fit:contain, including portrait/landscape letterboxing.
  return <svg className="video-evidence-overlay" viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Approximate region referenced by the selected correction">
    <rect x={x * frame.width} y={y * frame.height} width={width * frame.width} height={height * frame.height} rx="4" fill="#ffcf6420" stroke="#ffcf64" strokeWidth="3" vectorEffect="non-scaling-stroke" />
  </svg>;
}
