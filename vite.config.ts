/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Dev-only plugin: serves the same Web-standard handlers that run as Vercel
 * Functions in production (server/core.ts) under /api, so `npm run dev` gives
 * the full game, leaderboard included, with no extra tooling. Without a
 * DATABASE_URL the handlers fall back to an in-memory store.
 */
function devApi(): Plugin {
  return {
    name: 'multiverse-dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          const core = await server.ssrLoadModule('/server/core.ts');
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
          });
          const path = req.url.split('?')[0];
          const handler =
            path === '/api/session' && req.method === 'POST'
              ? core.createSession
              : path === '/api/scores' && req.method === 'GET'
                ? core.getScores
                : path === '/api/scores' && req.method === 'POST'
                  ? core.submitScore
                  : null;
          const response: Response = handler ? await handler(request) : new Response('{"error":"not found"}', { status: 404 });
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          console.error(err);
          res.statusCode = 500;
          res.end('{"error":"dev api crashed"}');
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Expose DATABASE_URL / LEADERBOARD_SECRET from .env to the dev API.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [react(), tailwindcss(), devApi()],
    build: {
      chunkSizeWarningLimit: 1200,
    },
    test: {
      include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    },
  };
});
