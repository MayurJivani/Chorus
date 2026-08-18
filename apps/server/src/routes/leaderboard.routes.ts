import { Router } from 'express';
import {
  getGlobalLeaderboard,
  getMostPlayedArtists,
  getCategoryLeaderboard,
  getMostPlayedCategories,
} from '../services/leaderboardService';
import { getIdentity } from '../auth/identity';
import { asyncHandler } from '../middleware/asyncHandler';

export const leaderboardRouter = Router();

leaderboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const identity = getIdentity(req);
    const [players, artists, categoryPlayers, categories] = await Promise.all([
      getGlobalLeaderboard(identity),
      getMostPlayedArtists(),
      getCategoryLeaderboard(identity),
      getMostPlayedCategories(),
    ]);

    res.json({
      players,
      mostPlayedArtists: artists,
      // Category runs are ranked on their own board — see getGlobalLeaderboard for why.
      categoryPlayers,
      mostPlayedCategories: categories,
      // Lets the client offer a guest the chance to claim a place rather than silently
      // leaving them off a board they cannot appear on.
      isRegistered: identity.userId != null,
    });
  }),
);
