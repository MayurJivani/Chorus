/**
 * Duels are now live 1v1: you queue over the WebSocket, get matched with someone waiting on the
 * same artist or category, and race them in a room. So there is nothing here for creating or
 * accepting a duel — matchmaking is `duel_queue_*` on the socket, and settlement happens when
 * the room finishes.
 *
 * What remains is read-only history and the rating board, plus a REST snapshot of the queue for
 * the initial page render before the socket has connected.
 *
 * Accounts only: a rating has to attach to something that persists and is attributable, which a
 * guest cookie is not.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getDuel, getRatingLeaderboard, listDuelsForUser } from '../services/duelService';
import { getQueueCounts } from '../services/duelQueueService';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/requireAuth';

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

/**
 * Who is waiting, and for what.
 *
 * Also served over the socket, which is what keeps it live — this exists so the page can render
 * counts on first paint instead of showing an empty queue for as long as the socket takes to
 * open, which reads as "nobody is here" at exactly the wrong moment.
 */
duelsRouter.get(
  '/queue',
  asyncHandler(async (_req, res) => {
    const counts = getQueueCounts();
    res.json({ counts, total: counts.reduce((sum, c) => sum + c.count, 0) });
  }),
);

duelsRouter.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ duels: await listDuelsForUser(req.session.userId!) });
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
