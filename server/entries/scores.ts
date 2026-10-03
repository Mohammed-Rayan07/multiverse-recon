// Vercel Function entry: GET/POST /api/scores (bundled to api/scores.js by scripts/build-api.mjs)
import { getScores, submitScore } from '../core';

export const GET = (req: Request) => getScores(req);
export const POST = (req: Request) => submitScore(req);
