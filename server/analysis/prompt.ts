// Compatibility entry point: keep every analysis caller on the shared current rubric.
import { buildAnalysisInstructions } from './rubric';
export { buildAnalysisInstructions } from './rubric';
export const ANALYSIS_INSTRUCTIONS = buildAnalysisInstructions('dumbbell_curl');
