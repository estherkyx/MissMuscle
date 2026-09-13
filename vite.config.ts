import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { apiMiddleware } from './scripts/dev-api';
import worker from './server';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
    plugins: [
      react(),
      {
        name: 'missmuscle-local-api',
        configureServer(server) {
          server.middlewares.use(apiMiddleware(async () => {
            const module = await server.ssrLoadModule('/server/index.ts');
            return module.default;
          }, env));
        },
        configurePreviewServer(server) {
          server.middlewares.use(apiMiddleware(async () => worker, env));
        },
      },
    ],
    server: { port: 5173, strictPort: true },
    build: { outDir: 'dist/client', emptyOutDir: true },
  };
});
