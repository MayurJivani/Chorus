import { Router } from 'express';
import { getGlobalLeaderboard, getMostPlayedArtists } from '../services/leaderboardService';
import { getIdentity } from '../auth/identity';
import { asyncHandler } from '../middleware/asyncHandler';

export const leaderboardRouter = Router();

leaderboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const identity = getIdentity(req);
    const [players, artists] = await Promise.all([
      getGlobalLeaderboard(identity),
      getMostPlayedArtists(),
    ]);

    res.json({
      players,
      mostPlayedArtists: artists,
      // Lets the client offer a guest the chance to claim a place rather than silently
      // leaving them off a board they cannot appear on.
      isRegistered: identity.userId != null,
    });
  }),
);
