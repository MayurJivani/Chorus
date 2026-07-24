import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { gameResults } from '../db/schema';
import {
  getOrCreateDailyPuzzle,
  getSongById,
  getUtcDateString,
  SNIPPET_SCHEDULE_SECONDS,
  MAX_GUESSES,
} from '../services/puzzleService';
import { isCorrectGuess, isFinalAttempt } from '../services/guessService';
import { recordGameResult } from '../services/statsService';
import { getFreshPreviewUrl } from '../services/deezerService';
import { validate } from '../middleware/validate';
import { guessRateLimiter } from '../middleware/rateLimiters';
import { HttpError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';
import { getIdentity } from '../auth/identity';
import type { Request } from 'express';

export const puzzleRouter = Router();

function findCompletedResult(puzzleId: number, req: Request) {
  const { userId, guestId } = getIdentity(req);
  if (userId) {
    return db
      .select()
      .from(gameResults)
      .where(and(eq(gameResults.puzzleId, puzzleId), eq(gameResults.userId, userId)))
      .get();
  }
  return db
    .select()
    .from(gameResults)
    .where(and(eq(gameResults.puzzleId, puzzleId), eq(gameResults.guestId, guestId ?? '')))
    .get();
}

function revealSong(songId: number) {
  const song = getSongById(songId);
  if (!song) return null;
  return { title: song.title, artist: song.artist, albumArtUrl: song.albumArtUrl };
}

puzzleRouter.get(
  '/today',
  asyncHandler(async (req, res) => {
    const puzzleDate = getUtcDateString();
    const puzzle = getOrCreateDailyPuzzle(puzzleDate);
    const completed = findCompletedResult(puzzle.id, req);

    if (completed) {
      res.json({
        puzzleId: puzzle.id,
        puzzleDate,
        completed: true,
        won: completed.won,
        guessesUsed: completed.guessesUsed,
        song: revealSong(puzzle.songId),
        snippetSchedule: SNIPPET_SCHEDULE_SECONDS,
      });
      return;
    }

    const song = getSongById(puzzle.songId);
    if (!song) {
      throw new HttpError(500, 'Puzzle song is missing from the song bank');
    }

    // The stored preview_url is a curation-time snapshot — Deezer's signed preview links
    // expire in minutes, so the URL actually handed to a player is always fetched live.
    const fresh = await getFreshPreviewUrl(song.deezerTrackId);
    if (!fresh) {
      throw new HttpError(503, 'This song is temporarily unavailable — please try again shortly');
    }

    res.json({
      puzzleId: puzzle.id,
      puzzleDate,
      completed: false,
      previewUrl: fresh.previewUrl,
      snippetSchedule: SNIPPET_SCHEDULE_SECONDS,
      maxGuesses: MAX_GUESSES,
    });
  }),
);

const guessSchema = z.object({
  // Omitted entirely for a "skip" — the attempt is spent without guessing a specific song.
  songId: z.number().int().positive().optional(),
  guessNumber: z.number().int().min(1).max(MAX_GUESSES),
});

puzzleRouter.post('/today/guess', guessRateLimiter, validate(guessSchema), (req, res) => {
  const puzzleDate = getUtcDateString();
  const puzzle = getOrCreateDailyPuzzle(puzzleDate);

  if (findCompletedResult(puzzle.id, req)) {
    res.status(409).json({ error: "Today's puzzle has already been completed" });
    return;
  }

  const { songId, guessNumber } = req.body as z.infer<typeof guessSchema>;
  const correct = songId !== undefined && isCorrectGuess(songId, puzzle.songId);
  const final = isFinalAttempt(guessNumber, correct);

  if (final) {
    const { userId, guestId } = getIdentity(req);
    recordGameResult({
      ownerKey: userId ?? guestId ?? req.session.guestId,
      puzzleDate,
      won: correct,
      guessesUsed: guessNumber,
    });

    db.insert(gameResults)
      .values({
        userId,
        guestId,
        puzzleId: puzzle.id,
        won: correct,
        guessesUsed: guessNumber,
        snippetStageReached: guessNumber - 1,
      })
      .run();
  }

  res.json({
    correct,
    isFinal: final,
    song: final ? revealSong(puzzle.songId) : undefined,
  });
});
