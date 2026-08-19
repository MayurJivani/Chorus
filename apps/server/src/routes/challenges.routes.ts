/**
 * Lookups for a specific challenge, independent of which mode built it.
 *
 * A challenge id is global, so a shared link can be inspected without the client having to know
 * whether it came from Artist or Category mode.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getChallengeSummary } from '../services/artistChallengeService';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';

export const challengesRouter = Router();

challengesRouter.get(
  '/:challengeId/summary',
  validate(z.object({ challengeId: z.coerce.number().int().positive() }), 'params'),
  asyncHandler(async (req, res) => {
    const { challengeId } = req.params as unknown as { challengeId: number };
    const summary = await getChallengeSummary(challengeId);
    if (!summary) throw new HttpError(404, 'Challenge not found');
    res.json(summary);
  }),
);
