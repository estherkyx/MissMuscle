import type { LiveSessionRequest, LiveSessionResponse } from '../../shared/contracts';
import type { Env } from '../env';
import { ServiceError } from '../errors';

// Person B: implement the trusted-server GPT-Live WebRTC handshake.
// This is an app contract; do not forward it unchanged to OpenAI.
export async function createLiveSession(_request: LiveSessionRequest, _env: Env): Promise<LiveSessionResponse> {
  throw new ServiceError(501, 'LIVE_NOT_IMPLEMENTED', 'GPT-Live voice is not connected yet.');
}
