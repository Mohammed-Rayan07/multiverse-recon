// Vercel Function entry: POST /api/session (bundled to api/session.js by scripts/build-api.mjs)
import { createSession } from '../core';

export const POST = (req: Request) => createSession(req);
