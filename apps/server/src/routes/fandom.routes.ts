import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import { validate } from '../middleware/validate';
import { HttpError } from '../middleware/errorHandler';
import {
  joinFandom,
  leaveFandom,
  getUserFandoms,
  getMembership,
  getFandomDetail,
  getTopFandoms,
} from '../services/fandomService';

export const fandomRouter = Router();

function requireUser(req: { session: { userId: string | null } }): string {
  if (!req.session.userId) throw new HttpError(401, 'Login required');
  return req.session.userId;
}

/** Join an artist's fandom. */
fandomRouter.post(
  '/join',
  validate(
    z.object({
      deezerArtistId: z.string().min(1),
      artistName: z.string().min(1).max(200),
      artistPictureUrl: z.string().url().nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const userId = requireUser(req);
    const { deezerArtistId, artistName, artistPictureUrl } = req.body as {
      deezerArtistId: string;
      artistName: string;
      artistPictureUrl?: string | null;
    };

    const membership = await joinFandom(
      userId,
      deezerArtistId,
      artistName,
      artistPictureUrl ?? null,
    );
    res.json({ membership });
  }),
);

/** Leave an artist's fandom. */
fandomRouter.delete(
  '/:deezerArtistId',
  validate(z.object({ deezerArtistId: z.string().min(1) }), 'params'),
  asyncHandler(async (req, res) => {
    const userId = requireUser(req);
    const { deezerArtistId } = req.params as { deezerArtistId: string };

    const left = await leaveFandom(userId, deezerArtistId);
    if (!left) throw new HttpError(404, 'Not a member of that fandom');
    res.json({ ok: true });
  }),
);

/** List the current user's fandoms. */
fandomRouter.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const userId = requireUser(req);
    const fandoms = await getUserFandoms(userId);
    res.json({ fandoms });
  }),
);

/** Check membership status for a specific artist. */
fandomRouter.get(
  '/membership/:deezerArtistId',
  validate(z.object({ deezerArtistId: z.string().min(1) }), 'params'),
  asyncHandler(async (req, res) => {
    const userId = requireUser(req);
    const { deezerArtistId } = req.params as { deezerArtistId: string };

    const membership = await getMembership(userId, deezerArtistId);
    res.json({ membership });
  }),
);

/** Fandom detail with leaderboard. Public — anyone can view. */
fandomRouter.get(
  '/detail/:deezerArtistId',
  validate(z.object({ deezerArtistId: z.string().min(1) }), 'params'),
  asyncHandler(async (req, res) => {
    const { deezerArtistId } = req.params as { deezerArtistId: string };
    const detail = await getFandomDetail(deezerArtistId);
    if (!detail) throw new HttpError(404, 'No fandom exists for that artist yet');
    res.json(detail);
  }),
);

/** Top fandoms by member count. Public. */
fandomRouter.get(
  '/top',
  asyncHandler(async (_req, res) => {
    const fandoms = await getTopFandoms();
    res.json({ fandoms });
  }),
);

/** Percentile tier definitions so the client can render badges. */
fandomRouter.get('/tiers', (_req, res) => {
  res.json({
    tiers: [
      { label: 'Top 0.01%', maxPercentile: 0.01 },
      { label: 'Top 0.1%', maxPercentile: 0.1 },
      { label: 'Top 1%', maxPercentile: 1 },
      { label: 'Top 5%', maxPercentile: 5 },
      { label: 'Top 10%', maxPercentile: 10 },
      { label: 'Top 25%', maxPercentile: 25 },
      { label: 'Top 50%', maxPercentile: 50 },
      { label: 'Member', maxPercentile: 100 },
    ],
  });
});
