import { Router } from 'express';
import { z } from 'zod';
import {
  endActiveRun,
  getOrStartRound,
  getSurvivalLeaderboard,
  getSurvivalPool,
  submitSurvivalGuess,
  SurvivalUnavailableError,
} from '../services/survivalService';
import { getIdentity } from '../auth/identity';
import { validate } from '../middleware/validate';
import { searchRateLimiter, guessRateLimiter } from '../middleware/rateLimiters';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';

export const survivalRouter = Router();

const modeQuerySchema = z.object({ mode: z.enum(['search', 'choice']).optional() });

/** Turns "the pool isn't ready" into a 503 the client can retry, not a 500. */
function toHttp(err: unknown): never {
  if (err instanceof SurvivalUnavailableError) throw new HttpError(503, err.message);
  throw err;
}

survivalRouter.get(
  '/round',
  validate(modeQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { mode } = req.query as unknown as z.infer<typeof modeQuerySchema>;
    try {
      res.json(await getOrStartRound(getIdentity(req), mode ?? 'search'));
    } catch (err) {
      toHttp(err);
    }
  }),
);

const guessSchema = z.object({
  // Omitted for a give-up, which ends the run — there is no partial credit in Survival.
  deezerTrackId: z.string().min(1).optional(),
});

survivalRouter.post(
  '/guess',
  guessRateLimiter,
  validate(guessSchema),
  asyncHandler(async (req, res) => {
    const { deezerTrackId } = req.body as z.infer<typeof guessSchema>;
    try {
      res.json(await submitSurvivalGuess(getIdentity(req), deezerTrackId));
    } catch (err) {
      toHttp(err);
    }
  }),
);

/** Abandons the run in progress so the next visit starts clean. */
survivalRouter.post(
  '/give-up',
  asyncHandler(async (req, res) => {
    await endActiveRun(getIdentity(req));
    res.json({ ok: true });
  }),
);

survivalRouter.get(
  '/leaderboard',
  validate(modeQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { mode } = req.query as unknown as z.infer<typeof modeQuerySchema>;
    res.json(await getSurvivalLeaderboard(getIdentity(req), mode));
  }),
);

survivalRouter.get(
  '/tracks/search',
  searchRateLimiter,
  validate(z.object({ q: z.string().trim().min(1).max(80) }), 'query'),
  asyncHandler(async (req, res) => {
    const { q } = req.query as { q: string };

    // Searches the whole mixed pool, not the current song — narrowing suggestions to the answer
    // would make guessing trivial.
    const pool = await getSurvivalPool();
    const needle = q.toLowerCase();
    const results = pool
      .filter(
        (t) => t.title.toLowerCase().includes(needle) || t.artist.toLowerCase().includes(needle),
      )
      .slice(0, 8)
      .map((t) => ({
        deezerTrackId: t.deezerTrackId,
        title: t.title,
        artist: t.artist,
        albumArtUrl: t.albumArtUrl,
      }));

    res.json({ results });
  }),
);
