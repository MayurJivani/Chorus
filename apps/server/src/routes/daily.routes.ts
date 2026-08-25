import { Router } from 'express';
import { z } from 'zod';
import {
  getSessionOrStartNew,
  getActiveSessionForSource,
  loadChallengeTracks,
  recordArtistRoundResult,
  buildRoundOptions,
  getChallengeLeaderboard,
  resolvePlayableRoundForSource,
} from '../services/artistChallengeService';
import { resolveDailySource } from '../services/challengeSource';
import { isFinalAttempt } from '../services/guessService';
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

export const dailyRouter = Router();

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function dailySource() {
  const dateStr = todayUTC();
  return resolveDailySource(dateStr);
}

const modeQuerySchema = z.object({
  mode: z.enum(['search', 'choice']).optional(),
});

dailyRouter.get(
  '/today',
  validate(modeQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { mode } = req.query as unknown as z.infer<typeof modeQuerySchema>;
    const identity = getIdentity(req);
    const source = dailySource();
    const dateStr = todayUTC();

    const result = await getSessionOrStartNew(source, identity, false, undefined, dateStr);
    const { session, challenge, tracks } = result;

    const snippetSchedule = await getSnippetSchedule();
    const base = {
      challengeId: challenge.id,
      artistName: 'Daily Challenge',
      artistPictureUrl: null,
      totalRounds: challenge.totalRounds,
      currentRound: session.currentRound,
      songsCorrect: session.songsCorrect,
      totalGuessesUsed: session.totalGuessesUsed,
      completed: session.completed,
      date: dateStr,
    };

    if (session.completed) {
      res.json(base);
      return;
    }

    const storedTrack = tracks[session.currentRound];
    if (!storedTrack) {
      throw new HttpError(500, 'Challenge round is out of range');
    }

    const playable = await resolvePlayableRoundForSource(
      storedTrack,
      source,
      tracks.map((t) => t.deezerTrackId),
    );
    if (!playable) {
      throw new HttpError(503, 'This song is temporarily unavailable, please try again shortly');
    }
    const currentTrack = playable.track;

    const isChoiceMode = mode === 'choice';
    const options = isChoiceMode
      ? buildRoundOptions(currentTrack, await source.loadCatalog())
      : undefined;

    res.json({
      ...base,
      previewUrl: playable.previewUrl,
      snippetSchedule,
      maxGuesses: snippetSchedule.length,
      ...(options !== undefined ? { options } : {}),
    });
  }),
);

dailyRouter.get(
  '/tracks/search',
  validate(z.object({ q: z.string().trim().min(1).max(80) }), 'query'),
  asyncHandler(async (req, res) => {
    const { q } = req.query as unknown as { q: string };
    const source = dailySource();
    const pool = await source.loadCatalog();
    const needle = q.toLowerCase();
    const results = pool
      .filter(
        (t) => t.title.toLowerCase().includes(needle) || t.artist.toLowerCase().includes(needle),
      )
      .slice(0, 8)
      .map((t) => ({
        deezerTrackId: t.deezerTrackId,
        title: t.title,
        artist: t.artist,
        albumArtUrl: t.albumArtUrl,
      }));

    res.json({ results });
  }),
);

const guessSchema = z.object({
  deezerTrackId: z.string().min(1).optional(),
  guessNumber: z.number().int().min(1).max(MAX_GUESSES_LIMIT),
  guessMode: z.enum(['search', 'choice']).optional(),
});

dailyRouter.post(
  '/today/guess',
  guessRateLimiter,
  validate(guessSchema),
  asyncHandler(async (req, res) => {
    const { deezerTrackId, guessNumber, guessMode } = req.body as z.infer<typeof guessSchema>;
    const identity = getIdentity(req);
    const source = dailySource();

    const active = await getActiveSessionForSource(source, identity);
    if (!active) {
      res.status(409).json({ error: 'No active daily challenge session' });
      return;
    }

    const { session, challenge } = active;
    const tracks = await loadChallengeTracks(challenge.id);
    const currentTrack = tracks[session.currentRound];
    if (!currentTrack) {
      throw new HttpError(500, 'Challenge round is out of range');
    }

    const snippetSchedule = await getSnippetSchedule();
    if (guessNumber > snippetSchedule.length) {
      throw new HttpError(400, 'That guess number is past the end of the snippet schedule');
    }

    const correct = deezerTrackId !== undefined && deezerTrackId === currentTrack.deezerTrackId;
    const final =
      guessMode === 'choice' ? true : isFinalAttempt(guessNumber, correct, snippetSchedule.length);

    if (!final) {
      res.json({ correct, isFinal: false });
      return;
    }

    const snippetStageSeconds = snippetSecondsForGuess(guessNumber, snippetSchedule);
    const { sessionComplete, songsCorrect, totalGuessesUsed, timeTakenSeconds, totalRounds } =
      await recordArtistRoundResult(session.id, correct, guessNumber, snippetStageSeconds);

    res.json({
      correct,
      isFinal: true,
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
            finalScore: {
              songsCorrect,
              totalGuessesUsed,
              timeTakenSeconds,
              totalRounds,
            },
          }
        : {}),
    });
  }),
);

dailyRouter.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    const source = dailySource();
    const identity = getIdentity(req);

    const existing = await getActiveSessionForSource(source, identity);
    if (!existing) {
      res.json({ entries: [], total: 0 });
      return;
    }

    res.json(await getChallengeLeaderboard(existing.challenge.id, identity));
  }),
);
