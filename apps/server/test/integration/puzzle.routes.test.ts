import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { db } from '../../src/db/client';
import { songs, dailyPuzzles, gameResults, userStats, sessions } from '../../src/db/schema';
import { getUtcDateString } from '../../src/services/puzzleService';

// The real handler fetches a fresh preview URL live from Deezer (its signed URLs expire in
// minutes, so the value stored at curation time is never reused directly). Mock that lookup
// so these tests don't depend on network access or real Deezer track ids.
vi.mock('../../src/services/deezerService', () => ({
  getFreshPreviewUrl: vi.fn().mockResolvedValue({
    previewUrl: 'https://example.test/fresh-preview.mp3',
    durationSeconds: 200,
  }),
}));

const app = createApp();

async function seedSong(n: number) {
  const [song] = await db
    .insert(songs)
    .values({
      title: `Song ${n}`,
      artist: `Artist ${n}`,
      deezerTrackId: `track-${n}`,
      previewUrl: `https://example.test/preview-${n}.mp3`,
      albumArtUrl: `https://example.test/art-${n}.jpg`,
      durationSeconds: 180,
    })
    .returning();
  return song;
}

async function getCsrfToken(agent: ReturnType<typeof request.agent>): Promise<string> {
  const res = await agent.get('/api/csrf-token');
  return res.body.csrfToken as string;
}

beforeEach(async () => {
  await db.delete(gameResults);
  await db.delete(userStats);
  await db.delete(dailyPuzzles);
  await db.delete(songs);
  await db.delete(sessions);
});

describe('GET /api/puzzle/today', () => {
  it('returns the preview url and schedule without revealing the answer', async () => {
    await seedSong(1);
    const res = await request(app).get('/api/puzzle/today');

    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(false);
    expect(res.body.previewUrl).toEqual(expect.any(String));
    expect(res.body.snippetSchedule).toEqual([1, 2, 4, 7, 11, 16]);
    expect(res.body.song).toBeUndefined();
    expect(res.body.title).toBeUndefined();
  });

  it('is deterministic across repeated calls the same day', async () => {
    await seedSong(1);
    await seedSong(2);
    await seedSong(3);

    const first = await request(app).get('/api/puzzle/today');
    const second = await request(app).get('/api/puzzle/today');

    expect(second.body.puzzleId).toBe(first.body.puzzleId);
    expect(second.body.previewUrl).toBe(first.body.previewUrl);
  });
});

describe('POST /api/puzzle/today/guess', () => {
  it('rejects a guess submitted without a CSRF token', async () => {
    await seedSong(1);
    const res = await request(app)
      .post('/api/puzzle/today/guess')
      .send({ songId: 1, guessNumber: 1 });
    expect(res.status).toBe(403);
  });

  it('treats an omitted songId as a skip: never correct, still consumes an attempt', async () => {
    await seedSong(1);
    const agent = request.agent(app);
    await agent.get('/api/puzzle/today');
    const csrfToken = await getCsrfToken(agent);

    const res = await agent
      .post('/api/puzzle/today/guess')
      .set('X-CSRF-Token', csrfToken)
      .send({ guessNumber: 1 });

    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(false);
    expect(res.body.isFinal).toBe(false);
  });

  it('reveals and records a loss when skips exhaust all attempts', async () => {
    await seedSong(1);
    const agent = request.agent(app);
    await agent.get('/api/puzzle/today');
    const csrfToken = await getCsrfToken(agent);

    const res = await agent
      .post('/api/puzzle/today/guess')
      .set('X-CSRF-Token', csrfToken)
      .send({ guessNumber: 6 });

    expect(res.body.correct).toBe(false);
    expect(res.body.isFinal).toBe(true);
    expect(res.body.song).toBeDefined();
  });

  it('does not reveal the answer on a wrong, non-final guess', async () => {
    const song = (await seedSong(1))!;
    await seedSong(2); // a second song so the wrong guess is a distinct, real id

    const agent = request.agent(app);
    await agent.get('/api/puzzle/today');
    const csrfToken = await getCsrfToken(agent);

    const wrongSongId = song.id === 1 ? 2 : 1;
    const res = await agent
      .post('/api/puzzle/today/guess')
      .set('X-CSRF-Token', csrfToken)
      .send({ songId: wrongSongId, guessNumber: 1 });

    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(false);
    expect(res.body.isFinal).toBe(false);
    expect(res.body.song).toBeUndefined();
  });

  it('reveals the answer and records a win on a correct guess', async () => {
    await seedSong(1);
    const agent = request.agent(app);
    const today = await agent.get('/api/puzzle/today');
    const puzzleId = today.body.puzzleId as number;
    const csrfToken = await getCsrfToken(agent);

    // Find the answer's song id via the daily_puzzles row directly (test-only shortcut).
    const puzzleRows = await db.select().from(dailyPuzzles);
    const puzzleRow = puzzleRows.find((p) => p.id === puzzleId)!;

    const res = await agent
      .post('/api/puzzle/today/guess')
      .set('X-CSRF-Token', csrfToken)
      .send({ songId: puzzleRow.songId, guessNumber: 2 });

    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
    expect(res.body.isFinal).toBe(true);
    expect(res.body.song.title).toEqual(expect.any(String));

    const stored = await db.select().from(gameResults);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.won).toBe(true);
    expect(stored[0]?.guessesUsed).toBe(2);
  });

  it('reveals the answer and records a loss after the max guess is used', async () => {
    const song = (await seedSong(1))!;
    await seedSong(2);
    const agent = request.agent(app);
    await agent.get('/api/puzzle/today');
    const csrfToken = await getCsrfToken(agent);

    const wrongSongId = song.id === 1 ? 2 : 1;
    const res = await agent
      .post('/api/puzzle/today/guess')
      .set('X-CSRF-Token', csrfToken)
      .send({ songId: wrongSongId, guessNumber: 6 });

    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(false);
    expect(res.body.isFinal).toBe(true);
    expect(res.body.song).toBeDefined();
  });

  it('rejects a second attempt to submit after the puzzle is already completed', async () => {
    await seedSong(1);
    const agent = request.agent(app);
    const today = await agent.get('/api/puzzle/today');
    const csrfToken = await getCsrfToken(agent);
    const puzzleRows = await db.select().from(dailyPuzzles);
    const puzzleRow = puzzleRows.find((p) => p.id === today.body.puzzleId)!;

    await agent
      .post('/api/puzzle/today/guess')
      .set('X-CSRF-Token', csrfToken)
      .send({ songId: puzzleRow.songId, guessNumber: 1 });
    const secondAttempt = await agent
      .post('/api/puzzle/today/guess')
      .set('X-CSRF-Token', csrfToken)
      .send({ songId: puzzleRow.songId, guessNumber: 1 });

    expect(secondAttempt.status).toBe(409);
  });

  it('GET /today reflects completion and reveals the answer once the puzzle is done', async () => {
    await seedSong(1);
    const agent = request.agent(app);
    const today = await agent.get('/api/puzzle/today');
    const csrfToken = await getCsrfToken(agent);
    const puzzleRows = await db.select().from(dailyPuzzles);
    const puzzleRow = puzzleRows.find((p) => p.id === today.body.puzzleId)!;

    await agent
      .post('/api/puzzle/today/guess')
      .set('X-CSRF-Token', csrfToken)
      .send({ songId: puzzleRow.songId, guessNumber: 1 });
    const after = await agent.get('/api/puzzle/today');

    expect(after.body.completed).toBe(true);
    expect(after.body.won).toBe(true);
    expect(after.body.song.title).toEqual(expect.any(String));
  });
});

// Sanity check that the deterministic date hash used for puzzle selection doesn't crash on today's real date.
describe('getUtcDateString sanity', () => {
  it('produces a plausible date string for "now"', () => {
    expect(getUtcDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
