import { Router } from 'express';
import { getStats, getSolveTimeStats } from '../services/statsService';
import { asyncHandler } from '../middleware/asyncHandler';

export const statsRouter = Router();

statsRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const ownerKey = req.session.userId ?? req.session.guestId;
    const [stats, solveTimes] = await Promise.all([
      getStats(ownerKey),
      getSolveTimeStats(ownerKey),
    ]);

    if (!stats) {
      res.json({
        currentStreak: 0,
        maxStreak: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        guessDistribution: [0, 0, 0, 0, 0, 0],
        lastPlayedDate: null,
        ...solveTimes,
      });
      return;
    }

    res.json({
      currentStreak: stats.currentStreak,
      maxStreak: stats.maxStreak,
      gamesPlayed: stats.gamesPlayed,
      gamesWon: stats.gamesWon,
      guessDistribution: [
        stats.guessDist1,
        stats.guessDist2,
        stats.guessDist3,
        stats.guessDist4,
        stats.guessDist5,
        stats.guessDist6,
      ],
      lastPlayedDate: stats.lastPlayedDate,
      ...solveTimes,
    });
  }),
);
