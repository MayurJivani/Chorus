import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { gameResults } from '../db/schema';
import {
  getOrCreateDailyPuzzle,
  getElapsedPuzzleSeconds,
  getSongById,
  getUtcDateString,
  markPuzzleStarted,
  getSnippetSchedule,
  MAX_GUESSES_LIMIT,
} from '../services/puzzleService';
import { isCorrectGuess, isFinalAttempt } from '../services/guessService';
import { recordGameResult } from '../services/statsService';
import { getFreshPreviewUrl } from '../services/deezerService';
import { ensureDailyPlaylistsFresh } from '../services/dailyPlaylistService';
import { validate } from '../middleware/validate';
import { guessRateLimiter } from '../middleware/rateLimiters';
import { HttpError } from '../middleware/errorHandler';
import { asyncHandler } from '../middleware/asyncHandler';
import { getIdentity } from '../auth/identity';
import { normalizeTitle } from '../utils/trackFilters';
import type { Request } from 'express';

export const puzzleRouter = Router();

async function findCompletedResult(puzzleId: number, req: Request) {
  const { userId, guestId } = getIdentity(req);
  if (userId) {
    const rows = await db
      .select()
      .from(gameResults)
      .where(and(eq(gameResults.puzzleId, puzzleId), eq(gameResults.userId, userId)))
      .limit(1);
    return rows[0];
  }
  const rows = await db
    .select()
    .from(gameResults)
    .where(and(eq(gameResults.puzzleId, puzzleId), eq(gameResults.guestId, guestId ?? '')))
    .limit(1);
  return rows[0];
}

/** Whether a wrong guess at least picked a song by the same artist as the answer. Artist names
 *  are compared normalized so "Beyoncé" and "Beyonce" count as a match. */
async function isSameArtist(guessedSongId: number | undefined, answerSongId: number) {
  if (guessedSongId === undefined) return false;

  const [guessed, answer] = await Promise.all([
    getSongById(guessedSongId),
    getSongById(answerSongId),
  ]);
  if (!guessed || !answer) return false;

  return normalizeTitle(guessed.artist) === normalizeTitle(answer.artist);
}

async function revealSong(songId: number) {
  const song = await getSongById(songId);
  if (!song) return null;
  return { title: song.title, artist: song.artist, albumArtUrl: song.albumArtUrl };
}

puzzleRouter.get(
  '/today',
  asyncHandler(async (req, res) => {
    await ensureDailyPlaylistsFresh();
    const puzzleDate = getUtcDateString();
    const puzzle = await getOrCreateDailyPuzzle(puzzleDate);
    const completed = await findCompletedResult(puzzle.id, req);

    if (completed) {
      res.json({
        puzzleId: puzzle.id,
        puzzleDate,
        completed: true,
        won: completed.won,
        guessesUsed: completed.guessesUsed,
        song: await revealSong(puzzle.songId),
        snippetSchedule: await getSnippetSchedule(),
      });
      return;
    }

    const song = await getSongById(puzzle.songId);
    if (!song) {
      throw new HttpError(500, 'Puzzle song is missing from the song bank');
    }

    // Start the clock the first time this player is handed a playable puzzle.
    const { userId, guestId } = getIdentity(req);
    await markPuzzleStarted(userId ?? guestId ?? req.session.guestId, puzzle.id);

    // The stored preview_url is a curation-time snapshot — Deezer's signed preview links
    // expire in minutes, so the URL actually handed to a player is always fetched live.
    const fresh = await getFreshPreviewUrl(song.deezerTrackId);
    if (!fresh) {
      throw new HttpError(503, 'This song is temporarily unavailable, please try again shortly');
    }

    res.json({
      puzzleId: puzzle.id,
      puzzleDate,
      completed: false,
      previewUrl: fresh.previewUrl,
      snippetSchedule: await getSnippetSchedule(),
      maxGuesses: (await getSnippetSchedule()).length,
    });
  }),
);

const guessSchema = z.object({
  // Omitted entirely for a "skip" — the attempt is spent without guessing a specific song.
  songId: z.number().int().positive().optional(),
  // Bounded by the largest schedule any setting allows, because a zod schema is built at
  // import time and cannot await the live one; the handler rejects anything over it.
  guessNumber: z.number().int().min(1).max(MAX_GUESSES_LIMIT),
});

puzzleRouter.post(
  '/today/guess',
  guessRateLimiter,
  validate(guessSchema),
  asyncHandler(async (req, res) => {
    await ensureDailyPlaylistsFresh();
    const puzzleDate = getUtcDateString();
    const puzzle = await getOrCreateDailyPuzzle(puzzleDate);

    if (await findCompletedResult(puzzle.id, req)) {
      res.status(409).json({ error: "Today's puzzle has already been completed" });
      return;
    }

    const { songId, guessNumber } = req.body as z.infer<typeof guessSchema>;
    const snippetSchedule = await getSnippetSchedule();
    if (guessNumber > snippetSchedule.length) {
      throw new HttpError(400, 'That guess number is past the end of the snippet schedule');
    }

    const correct = songId !== undefined && isCorrectGuess(songId, puzzle.songId);
    const final = isFinalAttempt(guessNumber, correct, snippetSchedule.length);

    if (final) {
      const { userId, guestId } = getIdentity(req);
      const ownerKey = userId ?? guestId ?? req.session.guestId;
      const timeTakenSeconds = await getElapsedPuzzleSeconds(ownerKey, puzzle.id);

      await recordGameResult({
        ownerKey,
        puzzleDate,
        won: correct,
        guessesUsed: guessNumber,
      });

      await db.insert(gameResults).values({
        userId,
        guestId,
        puzzleId: puzzle.id,
        won: correct,
        guessesUsed: guessNumber,
        snippetStageReached: guessNumber - 1,
        timeTakenSeconds,
      });
    }

    res.json({
      correct,
      isFinal: final,
      // "You had the right artist" is the one piece of feedback a snippet game can give that
      // actually narrows the search, and it costs nothing to compute. It is derived on the
      // server rather than by comparing artist strings in the browser, because the client is
      // never told the answer's artist until the puzzle is over — sending it would hand over
      // the answer to anyone opening the network tab.
      sameArtist: !correct && !final ? await isSameArtist(songId, puzzle.songId) : undefined,
      song: final ? await revealSong(puzzle.songId) : undefined,
    });
  }),
);
