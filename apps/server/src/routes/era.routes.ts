/**
 * Era mode — same ten-round shape as Artist and Category, but the answer is a year rather than
 * a song, so it needs its own guess endpoint. Everything below that (challenges, sessions,
 * leaderboards) is the shared machinery, reached through a `ChallengeSource` like the others.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  recordArtistRoundResult,
  getSourceLeaderboard,
  getActiveSessionForSource,
  getSessionOrStartNew,
  loadChallengeTracks,
  resolvePlayableRoundForSource,
} from '../services/artistChallengeService';
import {
  buildYearOptions,
  eraYearCategories,
  EraUnavailableError,
  requireEraPool,
} from '../services/eraService';
import type { ChallengeSource } from '../services/challengeSource';
import {
  getSnippetSchedule,
  snippetSecondsForGuess,
  MAX_GUESSES_LIMIT,
} from '../services/puzzleService';
import { getIdentity } from '../auth/identity';
import { validate } from '../middleware/validate';
import { guessRateLimiter } from '../middleware/rateLimiters';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';

export const eraRouter = Router();

/** A single global source: unlike artists and categories there is nothing to pick between. */
const ERA_SOURCE_ID = 'era';

function eraSource(): ChallengeSource {
  return {
    sourceType: 'era',
    sourceId: ERA_SOURCE_ID,
    label: 'Guess the Year',
    pictureUrl: null,
    includeFeatures: false,
    answerIsMovie: false,
    loadCatalog: requireEraPool,
  };
}

function toHttp(err: unknown): never {
  if (err instanceof EraUnavailableError) throw new HttpError(503, err.message);
  throw err;
}

const challengeQuerySchema = z.object({
  playAgain: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  challengeId: z.coerce.number().int().positive().optional(),
});

eraRouter.get(
  '/challenge/today',
  validate(challengeQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { playAgain, challengeId } = req.query as unknown as z.infer<typeof challengeQuerySchema>;
    const source = eraSource();
    const identity = getIdentity(req);

    let session, challenge, tracks;
    try {
      const result = await getSessionOrStartNew(source, identity, playAgain, challengeId);
      session = result.session;
      challenge = result.challenge;
      tracks = result.tracks;
    } catch (err) {
      if (err instanceof EraUnavailableError) toHttp(err);
      throw new HttpError(
        404,
        err instanceof Error ? err.message : 'Could not build an era challenge',
      );
    }

    const base = {
      challengeId: challenge.id,
      totalRounds: challenge.totalRounds,
      currentRound: session.currentRound,
      songsCorrect: session.songsCorrect,
      totalGuessesUsed: session.totalGuessesUsed,
      completed: session.completed,
    };

    if (session.completed) {
      res.json(base);
      return;
    }

    const storedTrack = tracks[session.currentRound];
    if (!storedTrack) throw new HttpError(500, 'Challenge round is out of range');

    const playable = await resolvePlayableRoundForSource(
      storedTrack,
      source,
      tracks.map((t) => t.deezerTrackId),
    );
    if (!playable) {
      throw new HttpError(503, 'This song is temporarily unavailable, please try again shortly');
    }

    // A substituted track carries its own year, so read the answer off whatever is actually
    // being played rather than the row we started with.
    const answerYear = playable.track.releaseYear;
    if (answerYear == null) {
      throw new HttpError(503, 'This round is missing its year, please try again shortly');
    }

    const snippetSchedule = await getSnippetSchedule();
    res.json({
      ...base,
      previewUrl: playable.previewUrl,
      snippetSchedule,
      maxGuesses: snippetSchedule.length,
      yearOptions: buildYearOptions(
        answerYear,
        eraYearCategories().map((y) => y.year),
      ),
    });
  }),
);

const guessSchema = z.object({
  // Omitted for a skip: the attempt is spent without naming a year.
  year: z.number().int().min(1900).max(2100).optional(),
  guessNumber: z.number().int().min(1).max(MAX_GUESSES_LIMIT),
});

eraRouter.post(
  '/challenge/today/guess',
  guessRateLimiter,
  validate(guessSchema),
  asyncHandler(async (req, res) => {
    const { year, guessNumber } = req.body as z.infer<typeof guessSchema>;
    const identity = getIdentity(req);

    const active = await getActiveSessionForSource(eraSource(), identity);
    if (!active) {
      res.status(409).json({ error: 'No active era challenge found' });
      return;
    }

    const { session, challenge } = active;
    const tracks = await loadChallengeTracks(challenge.id);
    const currentTrack = tracks[session.currentRound];
    if (!currentTrack) throw new HttpError(500, 'Challenge round is out of range');

    const snippetSchedule = await getSnippetSchedule();
    if (guessNumber > snippetSchedule.length) {
      throw new HttpError(400, 'That guess number is past the end of the snippet schedule');
    }

    const correct = year !== undefined && year === currentTrack.releaseYear;

    // One guess per round: with four options on screen, letting a player work through them
    // would make every round a certainty rather than a judgement.
    const snippetStageSeconds = snippetSecondsForGuess(guessNumber, snippetSchedule);
    const { sessionComplete, songsCorrect, totalGuessesUsed, timeTakenSeconds, totalRounds } =
      await recordArtistRoundResult(session.id, correct, guessNumber, snippetStageSeconds);

    res.json({
      correct,
      isFinal: true,
      answerYear: currentTrack.releaseYear,
      song: {
        title: currentTrack.title,
        artist: currentTrack.artist,
        albumArtUrl: currentTrack.albumArtUrl,
      },
      songsCorrect,
      currentRound: session.currentRound,
      sessionComplete,
      timeTakenSeconds,
      ...(sessionComplete
        ? {
            finalScore: { songsCorrect, totalGuessesUsed, timeTakenSeconds, totalRounds },
          }
        : {}),
    });
  }),
);

eraRouter.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    res.json(await getSourceLeaderboard('era', ERA_SOURCE_ID, getIdentity(req)));
  }),
);
