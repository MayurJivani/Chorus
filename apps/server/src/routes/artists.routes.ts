import { Router } from 'express';
import { z } from 'zod';
import {
  searchArtists,
  getFreshPreviewUrl,
  getArtistTopTracks,
  getArtistById,
} from '../services/deezerService';
import {
  recordArtistRoundResult,
  buildRoundOptions,
  getArtistLeaderboard,
  getChallengeLeaderboard,
  ARTIST_CHALLENGE_SIZE,
  getActiveSession,
  getActiveSessionOrStartNew,
  loadChallengeTracks,
} from '../services/artistChallengeService';
import { isFinalAttempt } from '../services/guessService';
import { SNIPPET_SCHEDULE_SECONDS, MAX_GUESSES } from '../services/puzzleService';
import { getIdentity } from '../auth/identity';
import { validate } from '../middleware/validate';
import { searchRateLimiter, guessRateLimiter } from '../middleware/rateLimiters';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';
import { getArtistGuessDistribution } from '../services/artistChallengeService';

export const artistsRouter = Router();

const artistIdParamsSchema = z.object({ artistId: z.coerce.number().int().positive() });
const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(80) });
const includeFeaturesQuerySchema = z.object({
  includeFeatures: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  playAgain: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  mode: z.enum(['search', 'choice']).optional(),
  challengeId: z.coerce.number().int().positive().optional(),
});

artistsRouter.get(
  '/search',
  searchRateLimiter,
  validate(searchQuerySchema, 'query'),
  async (req, res) => {
    const { q } = req.query as unknown as z.infer<typeof searchQuerySchema>;
    const results = await searchArtists(q);
    res.json({ results });
  },
);

artistsRouter.get(
  '/:artistId/challenge/today',
  validate(artistIdParamsSchema, 'params'),
  validate(includeFeaturesQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { artistId } = req.params as unknown as z.infer<typeof artistIdParamsSchema>;
    const { includeFeatures, playAgain, mode, challengeId } = req.query as unknown as z.infer<
      typeof includeFeaturesQuerySchema
    >;

    const identity = getIdentity(req);
    let session, challenge, tracks;
    try {
      const result = await getActiveSessionOrStartNew(
        artistId,
        includeFeatures,
        identity,
        playAgain,
        challengeId,
      );
      session = result.session;
      challenge = result.challenge;
      tracks = result.tracks;
    } catch (err) {
      throw new HttpError(
        404,
        err instanceof Error ? err.message : 'Could not build a challenge for this artist',
      );
    }

    const artistInfo = await getArtistById(artistId).catch(() => null);
    const base = {
      challengeId: challenge.id,
      artistName: challenge.artistName,
      artistPictureUrl: artistInfo?.pictureUrl ?? null,
      totalRounds: ARTIST_CHALLENGE_SIZE,
      currentRound: session.currentRound,
      songsCorrect: session.songsCorrect,
      totalGuessesUsed: session.totalGuessesUsed,
      completed: session.completed,
    };

    if (session.completed) {
      res.json(base);
      return;
    }

    const currentTrack = tracks[session.currentRound];
    if (!currentTrack) {
      throw new HttpError(500, 'Challenge round is out of range');
    }

    const fresh = await getFreshPreviewUrl(currentTrack.deezerTrackId);
    if (!fresh) {
      throw new HttpError(503, 'This song is temporarily unavailable — please try again shortly');
    }

    // Only fetch decoys and build multiple-choice options when the client is in 'choice' mode.
    // In 'search' mode we skip the extra Deezer call and omit `options` from the response.
    const isChoiceMode = mode === 'choice';
    const options = isChoiceMode
      ? buildRoundOptions(currentTrack, await getArtistTopTracks(artistId, includeFeatures))
      : undefined;

    res.json({
      ...base,
      previewUrl: fresh.previewUrl,
      snippetSchedule: SNIPPET_SCHEDULE_SECONDS,
      maxGuesses: MAX_GUESSES,
      ...(options !== undefined ? { options } : {}),
    });
  }),
);

artistsRouter.get(
  '/:artistId/tracks/search',
  searchRateLimiter,
  validate(artistIdParamsSchema, 'params'),
  validate(searchQuerySchema.merge(includeFeaturesQuerySchema), 'query'),
  asyncHandler(async (req, res) => {
    const { artistId } = req.params as unknown as z.infer<typeof artistIdParamsSchema>;
    const { q, includeFeatures } = req.query as unknown as z.infer<
      typeof searchQuerySchema & typeof includeFeaturesQuerySchema
    >;

    // Searches the artist's whole (filtered) catalog, not just today's 10 challenge tracks —
    // narrowing suggestions to the answer set would make guessing trivial.
    const pool = await getArtistTopTracks(artistId, includeFeatures);
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
  // Omitted entirely for a "skip" — the attempt is spent without guessing a specific track.
  deezerTrackId: z.string().min(1).optional(),
  guessNumber: z.number().int().min(1).max(MAX_GUESSES),
  guessMode: z.enum(['search', 'choice']).optional(),
});

artistsRouter.post(
  '/:artistId/challenge/today/guess',
  guessRateLimiter,
  validate(artistIdParamsSchema, 'params'),
  validate(includeFeaturesQuerySchema, 'query'),
  validate(guessSchema),
  asyncHandler(async (req, res) => {
    const { artistId } = req.params as unknown as z.infer<typeof artistIdParamsSchema>;
    const { includeFeatures } = req.query as unknown as z.infer<typeof includeFeaturesQuerySchema>;
    const { deezerTrackId, guessNumber, guessMode } = req.body as z.infer<typeof guessSchema>;

    const identity = getIdentity(req);
    const active = getActiveSession(artistId, includeFeatures, identity);

    if (!active) {
      res.status(409).json({ error: 'No active session found for this artist challenge' });
      return;
    }

    const { session, challenge } = active;
    const tracks = loadChallengeTracks(challenge.id);

    const currentTrack = tracks[session.currentRound];
    if (!currentTrack) {
      throw new HttpError(500, 'Challenge round is out of range');
    }

    const correct = deezerTrackId !== undefined && deezerTrackId === currentTrack.deezerTrackId;

    // For multiple choice, there's only one chance to guess correctly per round.
    const final = guessMode === 'choice' ? true : isFinalAttempt(guessNumber, correct);

    if (!final) {
      res.json({ correct, isFinal: false });
      return;
    }

    const snippetStageSeconds =
      SNIPPET_SCHEDULE_SECONDS[Math.min(guessNumber, SNIPPET_SCHEDULE_SECONDS.length) - 1] ?? 16;

    const { sessionComplete, songsCorrect, totalGuessesUsed, timeTakenSeconds } =
      recordArtistRoundResult(session.id, correct, guessNumber, snippetStageSeconds);

    res.json({
      correct,
      isFinal: true,
      song: {
        title: currentTrack.title,
        artist: currentTrack.artist,
        albumArtUrl: currentTrack.albumArtUrl,
      },
      sessionComplete,
      timeTakenSeconds,
      ...(sessionComplete
        ? {
            finalScore: {
              songsCorrect,
              totalGuessesUsed,
              timeTakenSeconds,
              totalRounds: ARTIST_CHALLENGE_SIZE,
            },
          }
        : {}),
    });
  }),
);

const challengeIdParamsSchema = z.object({
  artistId: z.coerce.number().int().positive(),
  challengeId: z.coerce.number().int().positive(),
});

artistsRouter.get(
  '/:artistId/challenge/:challengeId/leaderboard',
  validate(challengeIdParamsSchema, 'params'),
  (req, res) => {
    const { challengeId } = req.params as unknown as z.infer<typeof challengeIdParamsSchema>;
    const identity = getIdentity(req);
    res.json(getChallengeLeaderboard(challengeId, identity));
  },
);

artistsRouter.get(
  '/:artistId/leaderboard',
  validate(artistIdParamsSchema, 'params'),
  (req, res) => {
    const { artistId } = req.params as unknown as z.infer<typeof artistIdParamsSchema>;
    const identity = getIdentity(req);
    res.json(getArtistLeaderboard(artistId, identity));
  },
);

artistsRouter.get(
  '/:artistId/stats/guess-distribution',
  validate(artistIdParamsSchema, 'params'),
  (req, res) => {
    const { artistId } = req.params as unknown as z.infer<typeof artistIdParamsSchema>;
    const identity = getIdentity(req);
    res.json(getArtistGuessDistribution(artistId, identity));
  },
);
