import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../../src/app';
import { db } from '../../src/db/client';
import {
  artistChallenges,
  artistChallengeTracks,
  artistSessionResults,
  sessions,
  users,
} from '../../src/db/schema';
import * as deezerService from '../../src/services/deezerService';
import { clearArtistPools } from '../../src/services/artistCatalogService';

vi.mock('../../src/services/deezerService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/deezerService')>();
  return {
    ...actual,
    searchArtists: vi.fn(),
    getArtistById: vi.fn(),
    getArtistTopTracks: vi.fn(),
    getFreshPreviewUrl: vi.fn(),
  };
});

const app = createApp();

function mockTracks(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    deezerTrackId: `dz-${i}`,
    title: `Track ${i}`,
    artist: 'Queen',
    albumArtUrl: null,
    durationSeconds: 200,
  }));
}

async function getCsrfToken(agent: ReturnType<typeof request.agent>): Promise<string> {
  const res = await agent.get('/api/csrf-token');
  return res.body.csrfToken as string;
}

beforeEach(async () => {
  // Clear the Postgres-backed artist catalog so each test's deezerService mock is actually hit.
  await clearArtistPools();
  await db.delete(artistSessionResults);
  await db.delete(artistChallengeTracks);
  await db.delete(artistChallenges);
  await db.delete(sessions);
  // Leaderboard fixtures create accounts; without this they survive into the next test and
  // collide on the primary key.
  await db.delete(users);
  vi.clearAllMocks();
  vi.mocked(deezerService.getArtistById).mockResolvedValue({
    id: 412,
    name: 'Queen',
    pictureUrl: null,
  });
  vi.mocked(deezerService.getArtistTopTracks).mockResolvedValue(mockTracks(20));
  vi.mocked(deezerService.getFreshPreviewUrl).mockResolvedValue({
    previewUrl: 'https://example.test/preview.mp3',
    durationSeconds: 200,
  });
});

describe('GET /api/artists/search', () => {
  it('returns artist search results', async () => {
    vi.mocked(deezerService.searchArtists).mockResolvedValue([
      { id: 412, name: 'Queen', pictureUrl: 'a.jpg' },
    ]);

    const res = await request(app).get('/api/artists/search').query({ q: 'Queen' });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([{ id: 412, name: 'Queen', pictureUrl: 'a.jpg' }]);
  });
});

describe('GET /api/artists/:artistId/challenge/today', () => {
  it('returns a preview url, options, and no answer', async () => {
    const res = await request(app)
      .get('/api/artists/412/challenge/today')
      .query({ mode: 'choice' });

    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(false);
    expect(res.body.currentRound).toBe(0);
    expect(res.body.previewUrl).toBe('https://example.test/preview.mp3');
    expect(res.body.options).toHaveLength(3);
    expect(res.body.song).toBeUndefined();
  });

  it('404s with a clear message when the artist cannot be found', async () => {
    vi.mocked(deezerService.getArtistById).mockResolvedValue(null);
    const res = await request(app).get('/api/artists/999/challenge/today');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/artists/:artistId/tracks/search', () => {
  it('finds a track within the current challenge by title', async () => {
    // The deterministic shuffle only pulls 10 of the 20 mocked tracks into today's challenge,
    // so search for one that's actually in it rather than assuming a fixed title made the cut.
    await request(app).get('/api/artists/412/challenge/today');
    const allTracks = await db.select().from(artistChallengeTracks);
    const aTrack = allTracks[0]!;

    const res = await request(app).get('/api/artists/412/tracks/search').query({ q: aTrack.title });
    expect(res.status).toBe(200);
    expect(res.body.results.some((r: { title: string }) => r.title === aTrack.title)).toBe(true);
  });
});

describe('POST /api/artists/:artistId/challenge/today/guess', () => {
  it('rejects a guess without a CSRF token', async () => {
    const res = await request(app)
      .post('/api/artists/412/challenge/today/guess')
      .send({ guessNumber: 1 });
    expect(res.status).toBe(403);
  });

  it('does not reveal the answer on a wrong, non-final guess', async () => {
    const agent = request.agent(app);
    await agent.get('/api/artists/412/challenge/today');
    const csrfToken = await getCsrfToken(agent);

    const res = await agent
      .post('/api/artists/412/challenge/today/guess')
      .set('X-CSRF-Token', csrfToken)
      .send({ guessNumber: 1 }); // skip

    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(false);
    expect(res.body.isFinal).toBe(false);
    expect(res.body.song).toBeUndefined();
  });

  it('advances to the next round on a correct guess without completing the session', async () => {
    const agent = request.agent(app);
    const today = await agent.get('/api/artists/412/challenge/today');
    const csrfToken = await getCsrfToken(agent);

    const challengeTracks = await db.select().from(artistChallengeTracks);
    const correctTrack = challengeTracks.find(
      (t) => t.challengeId === today.body.challengeId && t.position === 0,
    )!;

    const res = await agent
      .post('/api/artists/412/challenge/today/guess')
      .set('X-CSRF-Token', csrfToken)
      .send({ deezerTrackId: correctTrack.deezerTrackId, guessNumber: 1 });

    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
    expect(res.body.isFinal).toBe(true);
    expect(res.body.sessionComplete).toBe(false);
    expect(res.body.song.title).toBe(correctTrack.title);

    const next = await agent.get('/api/artists/412/challenge/today');
    expect(next.body.currentRound).toBe(1);
    expect(next.body.songsCorrect).toBe(1);
  });

  it('completes the session and reports a final score after all 10 rounds', async () => {
    const agent = request.agent(app);

    for (let round = 0; round < 10; round += 1) {
      const today = await agent.get('/api/artists/412/challenge/today');
      if (today.body.completed) break;

      const csrfToken = await getCsrfToken(agent);
      const challengeTracks = await db.select().from(artistChallengeTracks);
      const correctTrack = challengeTracks.find(
        (t) => t.challengeId === today.body.challengeId && t.position === round,
      )!;

      const res = await agent
        .post('/api/artists/412/challenge/today/guess')
        .set('X-CSRF-Token', csrfToken)
        .send({ deezerTrackId: correctTrack.deezerTrackId, guessNumber: 1 });

      if (round === 9) {
        expect(res.body.sessionComplete).toBe(true);
        expect(res.body.finalScore).toEqual({
          songsCorrect: 10,
          totalGuessesUsed: 10,
          timeTakenSeconds: expect.any(Number),
          totalRounds: 10,
        });
      }
    }

    const final = await agent.get('/api/artists/412/challenge/today');
    expect(final.body.completed).toBe(true);
  });

  it('rejects further guesses once the session is already complete', async () => {
    const agent = request.agent(app);

    for (let round = 0; round < 10; round += 1) {
      const today = await agent.get('/api/artists/412/challenge/today');
      const csrfToken = await getCsrfToken(agent);
      const challengeTracks = await db.select().from(artistChallengeTracks);
      const correctTrack = challengeTracks.find(
        (t) => t.challengeId === today.body.challengeId && t.position === round,
      )!;

      await agent
        .post('/api/artists/412/challenge/today/guess')
        .set('X-CSRF-Token', csrfToken)
        .send({ deezerTrackId: correctTrack.deezerTrackId, guessNumber: 1 });
    }

    const csrfToken = await getCsrfToken(agent);
    const extra = await agent
      .post('/api/artists/412/challenge/today/guess')
      .set('X-CSRF-Token', csrfToken)
      .send({ guessNumber: 1 });

    expect(extra.status).toBe(409);
  });
});

describe('GET /api/artists/:artistId/leaderboard', () => {
  it('shows a completed session on the leaderboard', async () => {
    const agent = request.agent(app);

    for (let round = 0; round < 10; round += 1) {
      const today = await agent.get('/api/artists/412/challenge/today');
      const csrfToken = await getCsrfToken(agent);
      const challengeTracks = await db.select().from(artistChallengeTracks);
      const correctTrack = challengeTracks.find(
        (t) => t.challengeId === today.body.challengeId && t.position === round,
      )!;

      await agent
        .post('/api/artists/412/challenge/today/guess')
        .set('X-CSRF-Token', csrfToken)
        .send({ deezerTrackId: correctTrack.deezerTrackId, guessNumber: 1 });
    }

    const leaderboard = await agent.get('/api/artists/412/leaderboard');
    expect(leaderboard.status).toBe(200);
    // The board lists registered accounts only — a guest identity is just a cookie, so it is
    // neither stable nor attributable enough to rank. Their own score still comes back as
    // `myBest`, which is what the result screen shows them.
    expect(leaderboard.body.entries).toHaveLength(0);
    expect(leaderboard.body.myBest).toEqual({
      songsCorrect: 10,
      totalGuessesUsed: 10,
      timeTakenSeconds: expect.any(Number),
    });
  });

  it('is empty for an artist nobody has completed yet', async () => {
    const res = await request(app).get('/api/artists/412/leaderboard');
    expect(res.body.entries).toEqual([]);
    expect(res.body.myBest).toBeNull();
  });
});

describe('GET /api/artists/:artistId/challenge/:challengeId/leaderboard', () => {
  it('loads a specific shared challenge and reports scores on its per-challenge leaderboard', async () => {
    const agent1 = request.agent(app);
    const initial = await agent1.get('/api/artists/412/challenge/today');
    const challengeId = initial.body.challengeId;

    // First player completes it
    for (let round = 0; round < 10; round += 1) {
      const csrfToken = await getCsrfToken(agent1);
      const challengeTracks = await db.select().from(artistChallengeTracks);
      const correctTrack = challengeTracks.find(
        (t) => t.challengeId === challengeId && t.position === round,
      )!;

      await agent1
        .post('/api/artists/412/challenge/today/guess')
        .set('X-CSRF-Token', csrfToken)
        .send({ deezerTrackId: correctTrack.deezerTrackId, guessNumber: 1 });
    }

    // Second player loads the EXACT same challenge via ?challengeId=
    const agent2 = request.agent(app);
    const shared = await agent2.get('/api/artists/412/challenge/today').query({ challengeId });
    expect(shared.body.challengeId).toBe(challengeId);

    // Second player completes it too
    for (let round = 0; round < 10; round += 1) {
      const csrfToken = await getCsrfToken(agent2);
      const challengeTracks = await db.select().from(artistChallengeTracks);
      const correctTrack = challengeTracks.find(
        (t) => t.challengeId === challengeId && t.position === round,
      )!;

      await agent2
        .post('/api/artists/412/challenge/today/guess')
        .set('X-CSRF-Token', csrfToken)
        .send({ deezerTrackId: correctTrack.deezerTrackId, guessNumber: 2 });
    }

    // Check the per-challenge leaderboard
    // Both players complete with 10 songs correct, so the rank tie-breaks on completion
    // time first and guesses second. Wall-clock rounding can flip the time comparison, so
    // pin each player's stored time to keep the expected order deterministic.
    const results = await db
      .select({ id: artistSessionResults.id, guesses: artistSessionResults.totalGuessesUsed })
      .from(artistSessionResults)
      .where(eq(artistSessionResults.challengeId, challengeId));
    for (const row of results) {
      await db
        .update(artistSessionResults)
        .set({ timeTakenSeconds: row.guesses === 10 ? 10 : 20 })
        .where(eq(artistSessionResults.id, row.id));
    }

    // Both runs were played anonymously, and the board lists registered accounts only. Attach
    // each run to an account so the ordering this test exists to check is still exercised.
    for (const [index, row] of results.entries()) {
      const userId = `lb-user-${index}`;
      await db.insert(users).values({
        id: userId,
        email: `${userId}@example.test`,
        passwordHash: 'x',
        displayName: `Player ${index}`,
      });
      await db
        .update(artistSessionResults)
        .set({ userId, guestId: null })
        .where(eq(artistSessionResults.id, row.id));
    }

    const res = await request(app).get(`/api/artists/412/challenge/${challengeId}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    // Player 1 should be rank 1 (10 guesses vs 20 guesses)
    expect(res.body.entries[0].songsCorrect).toBe(10);
    expect(res.body.entries[0].totalGuessesUsed).toBe(10);
    expect(res.body.entries[1].songsCorrect).toBe(10);
    expect(res.body.entries[1].totalGuessesUsed).toBe(20);
  });
});
