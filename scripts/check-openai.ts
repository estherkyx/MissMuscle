import { loadEnv } from 'vite';

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env };
const key = env.OPENAI_API_KEY?.trim();
if (!key) {
  console.error('Missing OPENAI_API_KEY. Set it in .env; do not paste it into chat.');
  process.exitCode = 1;
} else {
  for (const model of [env.ASTRA_MODEL || 'gpt-6-astra', env.LIVE_MODEL || 'gpt-live-1']) {
    try {
      const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
        headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000),
      });
      console.log(`${model}: HTTP ${response.status}${response.ok ? ' (visible to this project; inference/audio still needs testing)' : ' (check project access and API key)'}`);
      if (!response.ok) process.exitCode = 1;
      await response.body?.cancel();
    } catch {
      console.error(`${model}: could not reach the official OpenAI API.`);
      process.exitCode = 1;
    }
  }
}
