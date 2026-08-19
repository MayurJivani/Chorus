/**
 * Rated 1v1 duels. Accounts only: a rating has to attach to something that persists and is
 * attributable, which a guest cookie is not.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  acceptDuel,
  createDuel,
  DuelError,
  getDuel,
  getRatingLeaderboard,
  listDuelsForUser,
  listOpenDuels,
} from '../services/duelService';
import { resolveArtistSource, resolveCategorySource } from '../services/challengeSource';
import { requireAuth } from '../middleware/requireAuth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';

export const duelsRouter = Router();

/** Public: the board is worth seeing before you have an account of your own. */
duelsRouter.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    res.json({
      entries: await getRatingLeaderboard(req.session.userId ?? null),
      isRegistered: req.session.userId != null,
    });
  }),
);

duelsRouter.get(
  '/open',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ duels: await listOpenDuels(req.session.userId!) });
  }),
);

duelsRouter.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ duels: await listDuelsForUser(req.session.userId!) });
  }),
);

const createSchema = z
  .object({
    artistId: z.coerce.number().int().positive().optional(),
    categoryId: z.string().min(1).max(64).optional(),
  })
  .refine(
    (body) => (body.artistId != null) !== (body.categoryId != null),
    'Provide exactly one of artistId or categoryId',
  );

duelsRouter.post(
  '/',
  requireAuth,
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { artistId, categoryId } = req.body as z.infer<typeof createSchema>;

    let source;
    try {
      source =
        artistId != null
          ? await resolveArtistSource(artistId, false)
          : resolveCategorySource(categoryId!);
    } catch {
      throw new HttpError(404, artistId != null ? 'Artist not found' : 'Unknown category');
    }

    try {
      res.status(201).json(await createDuel(source, req.session.userId!));
    } catch (err) {
      if (err instanceof DuelError) throw new HttpError(400, err.message);
      throw err;
    }
  }),
);

const duelIdSchema = z.object({ duelId: z.coerce.number().int().positive() });

duelsRouter.get(
  '/:duelId',
  validate(duelIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { duelId } = req.params as unknown as z.infer<typeof duelIdSchema>;
    const duel = await getDuel(duelId);
    if (!duel) throw new HttpError(404, 'Duel not found');
    res.json(duel);
  }),
);

duelsRouter.post(
  '/:duelId/accept',
  requireAuth,
  validate(duelIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { duelId } = req.params as unknown as z.infer<typeof duelIdSchema>;
    try {
      res.json(await acceptDuel(duelId, req.session.userId!));
    } catch (err) {
      if (err instanceof DuelError) throw new HttpError(409, err.message);
      throw err;
    }
  }),
);
