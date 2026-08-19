import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/client';
import { survivalRuns, users } from '../../src/db/schema';

const deezerMocks = vi.hoisted(() => ({
  getFreshPreviewUrl: vi.fn(),
}));
const catalogMocks = vi.hoisted(() => ({
  getCategoryCatalog: vi.fn(),
}));

vi.mock('../../src/services/deezerService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/deezerService')>();
  return { ...actual, ...deezerMocks };
});
vi.mock('../../src/services/categoryCatalogService', () => catalogMocks);

import {
  clearSurvivalPoolCache,
  endActiveRun,
  getBestStreak,
  getOrStartRound,
  getSurvivalLeaderboard,
  submitSurvivalGuess,
  SurvivalUnavailableError,
} from '../../src/services/survivalService';

const guest = { userId: null, guestId: 'guest-survival' };

function mockTracks(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    deezerTrackId: `sv-${i}`,
    title: `Song ${i}`,
    artist: `Artist ${i}`,
    albumArtUrl: null,
    durationSeconds: 200,
  }));
}

beforeEach(async () => {
  await db.delete(survivalRuns);
  await db.delete(users);
  vi.clearAllMocks();
  clearSurvivalPoolCache();
  catalogMocks.getCategoryCatalog.mockResolvedValue(mockTracks(40));
  deezerMocks.getFreshPreviewUrl.mockResolvedValue({
    previewUrl: 'https://example.test/p.mp3',
    durationSeconds: 30,
  });
});

/** Answers the pending round correctly, by reading back whichever song the server drew. */
async function answerCorrectly(identity = guest) {
  const rows = await db.select().from(survivalRuns).orderBy(survivalRuns.id);
  const run = rows[rows.length - 1]!;
  return submitSurvivalGuess(identity, run.currentTrackId ?? undefined);
}

describe('getOrStartRound', () => {
  it('starts a run at streak zero and serves a playable song', async () => {
    const round = await getOrStartRound(guest, 'search');

    expect(round.streak).toBe(0);
    expect(round.previewUrl).toBe('https://example.test/p.mp3');
    expect(round.options).toBeUndefined();
  });

  it('offers three options in choice mode', async () => {
    const round = await getOrStartRound(guest, 'choice');
    expect(round.options).toHaveLength(3);
  });

  /**
   * The regression this guards: if reloading drew a fresh song, a player stuck on one they
   * didn't know could refresh until an easy one came up — which is the whole game.
   */
  it('re-serves the same song on reload rather than drawing a new one', async () => {
    await getOrStartRound(guest, 'search');
    const [first] = await db.select().from(survivalRuns);

    await getOrStartRound(guest, 'search');
    const [second] = await db.select().from(survivalRuns);

    expect(second!.id).toBe(first!.id);
    expect(second!.currentTrackId).toBe(first!.currentTrackId);
    expect(second!.usedTrackIds).toHaveLength(1);
  });

  it('never repeats a song within a run', async () => {
    for (let i = 0; i < 8; i += 1) {
      await getOrStartRound(guest, 'search');
      await answerCorrectly();
    }

    const [run] = await db.select().from(survivalRuns);
    expect(run!.usedTrackIds).toHaveLength(8);
    expect(new Set(run!.usedTrackIds).size).toBe(8);
  });

  it('refuses to start when the pool is too small to play', async () => {
    catalogMocks.getCategoryCatalog.mockResolvedValue(mockTracks(2));
    clearSurvivalPoolCache();

    await expect(getOrStartRound(guest, 'search')).rejects.toBeInstanceOf(SurvivalUnavailableError);
  });

  it('survives one category being unavailable', async () => {
    catalogMocks.getCategoryCatalog
      .mockRejectedValueOnce(new Error('Deezer down'))
      .mockResolvedValue(mockTracks(40));
    clearSurvivalPoolCache();

    const round = await getOrStartRound(guest, 'search');
    expect(round.streak).toBe(0);
  });
});

describe('submitSurvivalGuess', () => {
  it('extends the streak on a correct answer and keeps the run open', async () => {
    await getOrStartRound(guest, 'search');
    const result = await answerCorrectly();

    expect(result).toMatchObject({ correct: true, streak: 1, runOver: false });
    const [run] = await db.select().from(survivalRuns);
    expect(run!.endedAt).toBeNull();
    // Cleared so the next request draws a new song instead of re-serving the answered one.
    expect(run!.currentTrackId).toBeNull();
  });

  it('ends the run on a wrong answer and reveals the song', async () => {
    await getOrStartRound(guest, 'search');
    const result = await submitSurvivalGuess(guest, 'definitely-not-the-answer');

    expect(result).toMatchObject({ correct: false, streak: 0, runOver: true });
    expect(result.song.title).toMatch(/^Song \d+$/);

    const [run] = await db.select().from(survivalRuns);
    expect(run!.endedAt).not.toBeNull();
  });

  it('treats giving up as a miss', async () => {
    await getOrStartRound(guest, 'search');
    await answerCorrectly();
    await getOrStartRound(guest, 'search');

    const result = await submitSurvivalGuess(guest, undefined);

    // The streak stands at what was actually survived, not zero.
    expect(result).toMatchObject({ correct: false, streak: 1, runOver: true });
  });

  it('reports the previous personal best when a run ends', async () => {
    // A first run of 2.
    for (let i = 0; i < 2; i += 1) {
      await getOrStartRound(guest, 'search');
      await answerCorrectly();
    }
    await getOrStartRound(guest, 'search');
    await submitSurvivalGuess(guest, 'wrong');

    // A second, shorter run.
    await getOrStartRound(guest, 'search');
    const result = await submitSurvivalGuess(guest, 'wrong');

    expect(result.streak).toBe(0);
    expect(result.personalBest).toBe(2);
  });

  it('rejects a guess when no round is in progress', async () => {
    await expect(submitSurvivalGuess(guest, 'sv-0')).rejects.toBeInstanceOf(
      SurvivalUnavailableError,
    );
  });

  it('starts a fresh run after the previous one ended', async () => {
    await getOrStartRound(guest, 'search');
    await answerCorrectly();
    await getOrStartRound(guest, 'search');
    await submitSurvivalGuess(guest, 'wrong');

    const round = await getOrStartRound(guest, 'search');
    expect(round.streak).toBe(0);
    expect(await db.select().from(survivalRuns)).toHaveLength(2);
  });
});

describe('getBestStreak', () => {
  it('is zero for someone who has never played', async () => {
    expect(await getBestStreak(guest)).toBe(0);
  });
});

describe('endActiveRun', () => {
  it('abandons the run in progress so the next visit starts clean', async () => {
    await getOrStartRound(guest, 'search');
    await endActiveRun(guest);

    const round = await getOrStartRound(guest, 'search');
    expect(round.streak).toBe(0);
    expect(await db.select().from(survivalRuns)).toHaveLength(2);
  });
});

describe('getSurvivalLeaderboard', () => {
  it('ranks registered players by longest streak and leaves guests off', async () => {
    await db.insert(users).values([
      { id: 'u1', email: 'u1@example.test', passwordHash: 'x', displayName: 'Ada' },
      { id: 'u2', email: 'u2@example.test', passwordHash: 'x', displayName: 'Grace' },
    ]);
    await db.insert(survivalRuns).values([
      { userId: 'u1', streak: 4, endedAt: new Date() },
      { userId: 'u1', streak: 9, endedAt: new Date() },
      { userId: 'u2', streak: 6, endedAt: new Date() },
      // A guest with the best streak of all must still not be ranked.
      { guestId: 'guest-survival', streak: 20, endedAt: new Date() },
    ]);

    const { entries, myBest } = await getSurvivalLeaderboard(guest);

    expect(entries.map((e) => e.displayName)).toEqual(['Ada', 'Grace']);
    expect(entries[0]).toMatchObject({ bestStreak: 9, runs: 2 });
    // The guest still sees their own number even though they are unranked.
    expect(myBest).toBe(20);
  });

  it('ignores runs still in progress', async () => {
    await db
      .insert(users)
      .values({ id: 'u1', email: 'u1@example.test', passwordHash: 'x', displayName: 'Ada' });
    await db.insert(survivalRuns).values({ userId: 'u1', streak: 5, endedAt: null });

    const { entries } = await getSurvivalLeaderboard(guest);
    expect(entries).toHaveLength(0);
  });
});
