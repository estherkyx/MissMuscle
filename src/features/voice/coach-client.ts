import type { CoachCommand, CoachContext } from '../../../shared/contracts';

// Person B owns this browser adapter as well as server/live/.
// Person A consumes this interface without needing OpenAI event knowledge.
export type CoachStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';
export interface CoachOptions {
  context: CoachContext;
  onStatus: (status: CoachStatus) => void;
  onCommand: (command: CoachCommand) => void;
  onTranscript: (entry: { role: 'user' | 'coach'; text: string; final: boolean }) => void;
}
export interface CoachConnection {
  updateContext(context: CoachContext): void;
  disconnect(): Promise<void>;
}

export async function connectCoach(_options: CoachOptions): Promise<CoachConnection> {
  throw new Error('GPT-Live connection is not implemented yet.');
}
