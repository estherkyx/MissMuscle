import type { AnalysisRequest, AnalysisReport } from '../../shared/contracts';
import type { Env } from '../env';
import { ServiceError } from '../errors';

// Person B: call Astra with ordered image inputs and return a validated report.
// See docs/PERSON_B.md. Keep provider logic out of the HTTP router.
export async function analyzeClip(_request: AnalysisRequest, _env: Env): Promise<AnalysisReport> {
  throw new ServiceError(501, 'ANALYSIS_NOT_IMPLEMENTED', 'Astra analysis is not connected yet. Use the explicitly labelled sample report to develop the interface.');
}
