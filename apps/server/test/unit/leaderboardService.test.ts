import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/client';
import {
  artistChallenges,
  artistChallengeTracks,
  artistRoundGuesses,
  artistSessionResults,
  users,
} from '../../src/db/schema';

const deezerMocks = vi.hoisted(() => ({
  getArtistById: vi.fn(),
  getArtistTopTracks: vi.fn(),
  getFreshPreviewUrl: vi.fn(),
}));

vi.mock('../../src/services/deezerService', () => deezerMocks);

import { clearArtistPools } from '../../src/services/artistCatalogService';
import { getGlobalLeaderboard, getMostPlayedArtists } from '../../src/services/leaderboardService';
import { getArtistLeaderboard } from '../../src/services/artistChallengeService';

const guestIdentity = { userId: null, guestId: 'guest-lb' };

async function seedUser(id: string, displayName: string) {
  await db.insert(users).values({
    id,
    email: `${id}@example.test`,
    passwordHash: 'x',
    displayName,
  });
}

/** A completed run, attributed either to a user or to a guest. */
async function seedRun(opts: {
  artistId: string;
  artistName: string;
  date: string;
  userId?: string;
  guestId?: string;
  songsCorrect: number;
  totalGuessesUsed: number;
  timeTakenSeconds: number | null;
}) {
  const [challenge] = await db
    .insert(artistChallenges)
    .values({
      deezerArtistId: opts.artistId,
      artistName: opts.artistName,
      challengeDate: opts.date,
    })
    .returning();

  await db.insert(artistSessionResults).values({
    challengeId: challenge!.id,
    userId: opts.userId ?? null,
    guestId: opts.guestId ?? null,
    songsCorrect: opts.songsCorrect,
    totalGuessesUsed: opts.totalGuessesUsed,
    timeTakenSeconds: opts.timeTakenSeconds,
    completed: true,
    currentRound: 9,
  });
}

beforeEach(async () => {
  await clearArtistPools();
  await db.delete(artistRoundGuesses);
  await db.delete(artistSessionResults);
  await db.delete(artistChallengeTracks);
  await db.delete(artistChallenges);
  await db.delete(users);
});

describe('getGlobalLeaderboard', () => {
  it('ranks registered players by total songs correct', async () => {
    await seedUser('u1', 'Ada');
    await seedUser('u2', 'Grace');

    await seedRun({
      artistId: '1',
      artistName: 'A',
      date: 'd1',
      userId: 'u1',
      songsCorrect: 8,
      totalGuessesUsed: 12,
      timeTakenSeconds: 100,
    });
    await seedRun({
      artistId: '1',
      artistName: 'A',
      date: 'd2',
      userId: 'u1',
      songsCorrect: 7,
      totalGuessesUsed: 14,
      timeTakenSeconds: 140,
    });
    await seedRun({
      artistId: '1',
      artistName: 'A',
      date: 'd3',
      userId: 'u2',
      songsCorrect: 10,
      totalGuessesUsed: 10,
      timeTakenSeconds: 90,
    });

    const entries = await getGlobalLeaderboard(guestIdentity);

    expect(entries.map((e) => e.displayName)).toEqual(['Ada', 'Grace']);
    expect(entries[0]).toMatchObject({
      rank: 1,
      runs: 2,
      songsCorrect: 15,
      songsPossible: 20,
      accuracy: 75,
      bestRun: 8,
      averageTimeSeconds: 120,
      fastestRunSeconds: 100,
    });
    expect(typeof entries[0]?.averageTimeSeconds).toBe('number');
  });

  it('leaves guests off the board entirely', async () => {
    await seedUser('u1', 'Ada');
    await seedRun({
      artistId: '1',
      artistName: 'A',
      date: 'd1',
      userId: 'u1',
      songsCorrect: 3,
      totalGuessesUsed: 20,
      timeTakenSeconds: 200,
    });
    // A guest with a far better run must still not appear — a cookie is not an identity.
    await seedRun({
      artistId: '1',
      artistName: 'A',
      date: 'd2',
      guestId: 'guest-lb',
      songsCorrect: 10,
      totalGuessesUsed: 10,
      timeTakenSeconds: 30,
    });

    const entries = await getGlobalLeaderboard(guestIdentity);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.displayName).toBe('Ada');
  });

  it('flags the caller so the client can highlight their row', async () => {
    await seedUser('u1', 'Ada');
    await seedRun({
      artistId: '1',
      artistName: 'A',
      date: 'd1',
      userId: 'u1',
      songsCorrect: 5,
      totalGuessesUsed: 15,
      timeTakenSeconds: 60,
    });

    const entries = await getGlobalLeaderboard({ userId: 'u1', guestId: null });
    expect(entries[0]?.isYou).toBe(true);

    const asOther = await getGlobalLeaderboard(guestIdentity);
    expect(asOther[0]?.isYou).toBe(false);
  });

  it('ignores runs that were never finished', async () => {
    await seedUser('u1', 'Ada');
    const [challenge] = await db
      .insert(artistChallenges)
      .values({ deezerArtistId: '1', artistName: 'A', challengeDate: 'unfinished' })
      .returning();
    await db.insert(artistSessionResults).values({
      challengeId: challenge!.id,
      userId: 'u1',
      songsCorrect: 9,
      completed: false,
    });

    expect(await getGlobalLeaderboard(guestIdentity)).toHaveLength(0);
  });
});

describe('getMostPlayedArtists', () => {
  it('counts completed runs per artist, including guests', async () => {
    await seedUser('u1', 'Ada');
    await seedRun({
      artistId: '412',
      artistName: 'Queen',
      date: 'q1',
      userId: 'u1',
      songsCorrect: 6,
      totalGuessesUsed: 12,
      timeTakenSeconds: 100,
    });
    await seedRun({
      artistId: '412',
      artistName: 'Queen',
      date: 'q2',
      guestId: 'guest-lb',
      songsCorrect: 4,
      totalGuessesUsed: 18,
      timeTakenSeconds: 150,
    });
    await seedRun({
      artistId: '892',
      artistName: 'Coldplay',
      date: 'c1',
      userId: 'u1',
      songsCorrect: 5,
      totalGuessesUsed: 15,
      timeTakenSeconds: 120,
    });

    const artists = await getMostPlayedArtists();

    expect(artists[0]).toMatchObject({
      deezerArtistId: '412',
      artistName: 'Queen',
      runs: 2,
      players: 2,
      averageScore: 5,
    });
    expect(artists[1]?.artistName).toBe('Coldplay');
    // Play counts measure usage, so anonymous play has to count toward them.
    expect(artists[0]?.runs).toBe(2);
  });

  it('returns nothing when no run has been completed', async () => {
    expect(await getMostPlayedArtists()).toEqual([]);
  });
});

describe('per-artist leaderboard', () => {
  it('no longer lists guest runs', async () => {
    await seedUser('u1', 'Ada');
    await seedRun({
      artistId: '412',
      artistName: 'Queen',
      date: 'q1',
      userId: 'u1',
      songsCorrect: 6,
      totalGuessesUsed: 12,
      timeTakenSeconds: 100,
    });
    await seedRun({
      artistId: '412',
      artistName: 'Queen',
      date: 'q2',
      guestId: 'guest-lb',
      songsCorrect: 10,
      totalGuessesUsed: 10,
      timeTakenSeconds: 20,
    });

    const { entries } = await getArtistLeaderboard(412, guestIdentity);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.displayName).toBe('Ada');
  });

  it('keeps a guest their own myBest, so they still see their score', async () => {
    await seedRun({
      artistId: '412',
      artistName: 'Queen',
      date: 'q2',
      guestId: 'guest-lb',
      songsCorrect: 10,
      totalGuessesUsed: 10,
      timeTakenSeconds: 20,
    });

    const { entries, myBest } = await getArtistLeaderboard(412, guestIdentity);

    expect(entries).toHaveLength(0);
    expect(myBest?.songsCorrect).toBe(10);
  });
});
