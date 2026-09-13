export interface Env {
  OPENAI_API_KEY?: string;
  ASTRA_MODEL?: string;
  LIVE_MODEL?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}
