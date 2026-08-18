import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { db } from '../../src/db/client';
import {
  artistChallenges,
  artistChallengeTracks,
  artistRoundGuesses,
  artistSessionResults,
  sessions,
  users,
} from '../../src/db/schema';
import * as deezerService from '../../src/services/deezerService';
import * as dailyPlaylistService from '../../src/services/dailyPlaylistService';
import { clearArtistPools } from '../../src/services/artistCatalogService';
import { CATEGORIES } from '../../src/services/categories';

vi.mock('../../src/services/deezerService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/deezerService')>();
  return { ...actual, getFreshPreviewUrl: vi.fn() };
});

vi.mock('../../src/services/dailyPlaylistService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/dailyPlaylistService')>();
  return { ...actual, fetchPlaylistTracks: vi.fn() };
});

const app = createApp();

/** A playlist's worth of tracks — each by a different artist, as a real category is. */
function mockPlaylistTracks(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    deezerTrackId: `cat-${i}`,
    title: `Category Track ${i}`,
    artist: `Artist ${i}`,
    albumArtUrl: null,
    durationSeconds: 200,
    previewUrl: `https://example.test/cat-${i}.mp3`,
  }));
}

const CATEGORY_ID = 'year-2020';

async function getCsrfToken(agent: ReturnType<typeof request.agent>): Promise<string> {
  const res = await agent.get('/api/csrf-token');
  return res.body.csrfToken as string;
}

beforeEach(async () => {
  // Category pools live in the same table as artist pools, so this clears both.
  await clearArtistPools();
  await db.delete(artistRoundGuesses);
  await db.delete(artistSessionResults);
  await db.delete(artistChallengeTracks);
  await db.delete(artistChallenges);
  await db.delete(sessions);
  await db.delete(users);
  vi.clearAllMocks();
  vi.mocked(dailyPlaylistService.fetchPlaylistTracks).mockResolvedValue(mockPlaylistTracks(30));
  vi.mocked(deezerService.getFreshPreviewUrl).mockResolvedValue({
    previewUrl: 'https://example.test/preview.mp3',
    durationSeconds: 200,
  });
});

describe('GET /api/categories', () => {
  it('lists the catalog without touching Deezer', async () => {
    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(CATEGORIES.length);
    expect(res.body.categories[0]).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
      group: expect.any(String),
    });
    // The backing playlist id is an implementation detail and must not leak to the client.
    expect(res.body.categories[0].playlistId).toBeUndefined();
    expect(dailyPlaylistService.fetchPlaylistTracks).not.toHaveBeenCalled();
  });
});

describe('GET /api/categories/:categoryId/challenge/today', () => {
  it('builds a ten-round challenge from the category playlist', async () => {
    const res = await request(app).get(`/api/categories/${CATEGORY_ID}/challenge/today`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalRounds: 10,
      currentRound: 0,
      songsCorrect: 0,
      completed: false,
      previewUrl: 'https://example.test/preview.mp3',
    });
    expect(res.body.artistName).toBe('Top Hits 2020');
  });

  it('tags the challenge as a category run so it stays off the artist board', async () => {
    await request(app).get(`/api/categories/${CATEGORY_ID}/challenge/today`);

    const rows = await db.select().from(artistChallenges);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceType: 'category', deezerArtistId: CATEGORY_ID });
  });

  it('404s an unknown category rather than failing with a 500', async () => {
    const res = await request(app).get('/api/categories/year-1066/challenge/today');
    expect(res.status).toBe(404);
  });

  it('omits multiple-choice options unless choice mode is asked for', async () => {
    const search = await request(app).get(`/api/categories/${CATEGORY_ID}/challenge/today`);
    expect(search.body.options).toBeUndefined();

    const choice = await request(app).get(
      `/api/categories/${CATEGORY_ID}/challenge/today?mode=choice`,
    );
    expect(choice.body.options).toHaveLength(3);
  });
});

describe('POST /api/categories/:categoryId/challenge/today/guess', () => {
  it('advances the round on a correct guess', async () => {
    const agent = request.agent(app);
    const csrf = await getCsrfToken(agent);
    await agent.get(`/api/categories/${CATEGORY_ID}/challenge/today`);

    const tracks = await db
      .select()
      .from(artistChallengeTracks)
      .orderBy(artistChallengeTracks.position);
    const first = tracks[0]!;

    const res = await agent
      .post(`/api/categories/${CATEGORY_ID}/challenge/today/guess`)
      .set('X-CSRF-Token', csrf)
      .send({ deezerTrackId: first.deezerTrackId, guessNumber: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ correct: true, isFinal: true, songsCorrect: 1 });

    const next = await agent.get(`/api/categories/${CATEGORY_ID}/challenge/today`);
    expect(next.body.currentRound).toBe(1);
  });

  it('409s when the player has no session for that category', async () => {
    const agent = request.agent(app);
    const csrf = await getCsrfToken(agent);

    const res = await agent
      .post(`/api/categories/${CATEGORY_ID}/challenge/today/guess`)
      .set('X-CSRF-Token', csrf)
      .send({ deezerTrackId: 'cat-0', guessNumber: 1 });

    expect(res.status).toBe(409);
  });
});

describe('GET /api/categories/:categoryId/tracks/search', () => {
  it('searches the whole category pool, by title or artist', async () => {
    await request(app).get(`/api/categories/${CATEGORY_ID}/challenge/today`);

    const byTitle = await request(app).get(
      `/api/categories/${CATEGORY_ID}/tracks/search?q=Category`,
    );
    expect(byTitle.status).toBe(200);
    expect(byTitle.body.results.length).toBeGreaterThan(0);

    const byArtist = await request(app).get(
      `/api/categories/${CATEGORY_ID}/tracks/search?q=Artist%207`,
    );
    expect(byArtist.body.results[0]).toMatchObject({ artist: 'Artist 7' });
  });
});

describe('category and artist boards stay separate', () => {
  it('keeps category runs out of the artist leaderboard and most-played list', async () => {
    const agent = request.agent(app);
    const csrf = await getCsrfToken(agent);
    await agent.post('/api/auth/register').set('X-CSRF-Token', csrf).send({
      email: 'cat@example.test',
      password: 'password123',
      displayName: 'Cat Player',
    });

    // Play a category run to completion.
    const freshCsrf = await getCsrfToken(agent);
    for (let round = 0; round < 10; round += 1) {
      await agent.get(`/api/categories/${CATEGORY_ID}/challenge/today`);
      const tracks = await db
        .select()
        .from(artistChallengeTracks)
        .orderBy(artistChallengeTracks.position);
      await agent
        .post(`/api/categories/${CATEGORY_ID}/challenge/today/guess`)
        .set('X-CSRF-Token', freshCsrf)
        .send({ deezerTrackId: tracks[round]!.deezerTrackId, guessNumber: 1 });
    }

    const board = await agent.get('/api/leaderboard');
    expect(board.status).toBe(200);
    // The run belongs to the category board only.
    expect(board.body.players).toHaveLength(0);
    expect(board.body.mostPlayedArtists).toHaveLength(0);
    expect(board.body.categoryPlayers).toHaveLength(1);
    expect(board.body.categoryPlayers[0]).toMatchObject({
      displayName: 'Cat Player',
      songsCorrect: 10,
    });
    expect(board.body.mostPlayedCategories[0]).toMatchObject({
      deezerArtistId: CATEGORY_ID,
      artistName: 'Top Hits 2020',
      runs: 1,
    });
  });
});
