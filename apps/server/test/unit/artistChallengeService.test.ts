import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import {
  artistChallenges,
  artistChallengeTracks,
  artistSessionResults,
  artistRoundGuesses,
  users,
} from '../../src/db/schema';
import * as deezerService from '../../src/services/deezerService';
import { clearArtistPools } from '../../src/services/artistCatalogService';

vi.mock('../../src/services/deezerService', () => ({
  getArtistById: vi.fn(),
  getArtistTopTracks: vi.fn(),
  getFreshPreviewUrl: vi.fn(),
}));

// Imported after the mock so the module under test picks up the mocked deezerService.
import {
  getOrCreateArtistChallenge,
  getOrCreateSessionProgress,
  recordArtistRoundResult,
  buildRoundOptions,
  getArtistLeaderboard,
  getArtistGuessDistribution,
  resolvePlayableRound,
  loadChallengeTracks,
  ARTIST_CHALLENGE_SIZE,
} from '../../src/services/artistChallengeService';

function mockTracks(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    deezerTrackId: `dz-${i}`,
    title: `Track ${i}`,
    artist: 'Queen',
    albumArtUrl: null,
    durationSeconds: 200,
  }));
}

beforeEach(async () => {
  // The artist catalog is cached in Postgres, so it must be cleared too — otherwise a stored
  // pool would satisfy the lookup and the per-test deezerService mock would never be called.
  await clearArtistPools();
  await db.delete(artistRoundGuesses);
  await db.delete(artistSessionResults);
  await db.delete(artistChallengeTracks);
  await db.delete(artistChallenges);
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

describe('getOrCreateArtistChallenge', () => {
  it('creates a challenge with exactly ARTIST_CHALLENGE_SIZE tracks', async () => {
    const { challenge, tracks } = await getOrCreateArtistChallenge(412, '2026-01-01');
    expect(challenge.artistName).toBe('Queen');
    expect(tracks).toHaveLength(ARTIST_CHALLENGE_SIZE);
    expect(new Set(tracks.map((t) => t.deezerTrackId)).size).toBe(ARTIST_CHALLENGE_SIZE);
  });

  it('is deterministic and idempotent for the same artist+date', async () => {
    const first = await getOrCreateArtistChallenge(412, '2026-01-01');
    const second = await getOrCreateArtistChallenge(412, '2026-01-01');

    expect(second.challenge.id).toBe(first.challenge.id);
    expect(second.tracks.map((t) => t.deezerTrackId)).toEqual(
      first.tracks.map((t) => t.deezerTrackId),
    );
    // Second call should not need to hit Deezer again since the challenge already exists.
    expect(deezerService.getArtistTopTracks).toHaveBeenCalledTimes(1);
  });

  it('produces different track sets for different dates', async () => {
    const day1 = await getOrCreateArtistChallenge(412, '2026-01-01');
    const day2 = await getOrCreateArtistChallenge(412, '2026-01-02');

    expect(day2.tracks.map((t) => t.deezerTrackId)).not.toEqual(
      day1.tracks.map((t) => t.deezerTrackId),
    );
  });

  it('throws when the artist has fewer than ARTIST_CHALLENGE_SIZE playable tracks', async () => {
    vi.mocked(deezerService.getArtistTopTracks).mockResolvedValue(mockTracks(3));
    await expect(getOrCreateArtistChallenge(412, '2026-01-01')).rejects.toThrow(/not enough/i);
  });

  it('throws when the artist cannot be found', async () => {
    vi.mocked(deezerService.getArtistById).mockResolvedValue(null);
    await expect(getOrCreateArtistChallenge(999, '2026-01-01')).rejects.toThrow(/not found/i);
  });

  it('treats includeFeatures as part of the challenge identity — two independent challenges', async () => {
    const withoutFeatures = await getOrCreateArtistChallenge(412, '2026-01-01', false);
    const withFeatures = await getOrCreateArtistChallenge(412, '2026-01-01', true);

    expect(withFeatures.challenge.id).not.toBe(withoutFeatures.challenge.id);
    expect(deezerService.getArtistTopTracks).toHaveBeenCalledWith(412, false);
    expect(deezerService.getArtistTopTracks).toHaveBeenCalledWith(412, true);
  });
});

describe('getOrCreateSessionProgress + recordArtistRoundResult', () => {
  it('starts a guest session at round 0 and progresses correctly', async () => {
    const { challenge } = await getOrCreateArtistChallenge(412, '2026-01-01');
    const session = await getOrCreateSessionProgress(challenge.id, {
      userId: null,
      guestId: 'guest-1',
    });

    expect(session.currentRound).toBe(0);
    expect(session.completed).toBe(false);

    const same = await getOrCreateSessionProgress(challenge.id, {
      userId: null,
      guestId: 'guest-1',
    });
    expect(same.id).toBe(session.id);

    const result = await recordArtistRoundResult(session.id, true, 2, 2);
    expect(result.sessionComplete).toBe(false);
    expect(result.songsCorrect).toBe(1);
    expect(result.totalGuessesUsed).toBe(2);
  });

  it('marks the session complete after the final round', async () => {
    const { challenge } = await getOrCreateArtistChallenge(412, '2026-01-01');
    const session = await getOrCreateSessionProgress(challenge.id, {
      userId: null,
      guestId: 'guest-2',
    });

    let lastResult = await recordArtistRoundResult(session.id, true, 1, 1);
    for (let round = 1; round < ARTIST_CHALLENGE_SIZE; round += 1) {
      lastResult = await recordArtistRoundResult(session.id, round % 2 === 0, 3, 4);
    }

    expect(lastResult.sessionComplete).toBe(true);
  });
});

describe('buildRoundOptions', () => {
  const correct = {
    deezerTrackId: 'dz-correct',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    albumArtUrl: null,
    durationSeconds: 200,
  };
  const pool = [
    correct,
    {
      deezerTrackId: 'dz-1',
      title: 'Under Pressure',
      artist: 'Queen',
      albumArtUrl: null,
      durationSeconds: 200,
    },
    {
      deezerTrackId: 'dz-2',
      title: "Don't Stop Me Now",
      artist: 'Queen',
      albumArtUrl: null,
      durationSeconds: 200,
    },
    {
      deezerTrackId: 'dz-3',
      title: 'We Will Rock You',
      artist: 'Queen',
      albumArtUrl: null,
      durationSeconds: 200,
    },
  ];

  it('always includes the correct track among three options', () => {
    const options = buildRoundOptions(correct, pool);
    expect(options).toHaveLength(3);
    expect(options.some((o) => o.deezerTrackId === correct.deezerTrackId)).toBe(true);
    expect(new Set(options.map((o) => o.deezerTrackId)).size).toBe(3);
  });

  it('never picks a decoy that normalizes to the same title as the correct answer', () => {
    const poolWithDuplicateTitle = [
      correct,
      // A different track id but the same song under a slightly different title casing/punctuation.
      {
        deezerTrackId: 'dz-dup',
        title: 'bohemian rhapsody!',
        artist: 'Queen',
        albumArtUrl: null,
        durationSeconds: 200,
      },
      {
        deezerTrackId: 'dz-1',
        title: 'Under Pressure',
        artist: 'Queen',
        albumArtUrl: null,
        durationSeconds: 200,
      },
      {
        deezerTrackId: 'dz-2',
        title: "Don't Stop Me Now",
        artist: 'Queen',
        albumArtUrl: null,
        durationSeconds: 200,
      },
    ];

    for (let i = 0; i < 20; i += 1) {
      const options = buildRoundOptions(correct, poolWithDuplicateTitle);
      expect(options.some((o) => o.deezerTrackId === 'dz-dup')).toBe(false);
    }
  });

  it('draws decoys from the wider pool, not just a fixed set of 9', () => {
    const bigPool = [
      correct,
      ...Array.from({ length: 40 }, (_, i) => ({
        deezerTrackId: `dz-wide-${i}`,
        title: `Wide Track ${i}`,
        artist: 'Queen',
        albumArtUrl: null,
        durationSeconds: 200,
      })),
    ];

    const seenDecoyIds = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      const options = buildRoundOptions(correct, bigPool);
      options
        .filter((o) => o.deezerTrackId !== correct.deezerTrackId)
        .forEach((o) => seenDecoyIds.add(o.deezerTrackId));
    }

    expect(seenDecoyIds.size).toBeGreaterThan(2);
  });
});

describe('getArtistLeaderboard', () => {
  it('ranks by songs correct desc, then fewer guesses, and flags the caller', async () => {
    const { challenge } = await getOrCreateArtistChallenge(412, '2026-01-01');

    const guestA = await getOrCreateSessionProgress(challenge.id, {
      userId: null,
      guestId: 'guest-a',
    });
    const guestB = await getOrCreateSessionProgress(challenge.id, {
      userId: null,
      guestId: 'guest-b',
    });

    for (let i = 0; i < ARTIST_CHALLENGE_SIZE; i += 1)
      await recordArtistRoundResult(guestA.id, true, 2, 2); // 10/10, 20 guesses
    for (let i = 0; i < ARTIST_CHALLENGE_SIZE; i += 1)
      await recordArtistRoundResult(guestB.id, true, 1, 1); // 10/10, 10 guesses

    // Wall-clock rounding can flip the time comparison, so pin each player's stored time to
    // keep the expected order (time-then-guesses) deterministic.
    await db
      .update(artistSessionResults)
      .set({ timeTakenSeconds: 20 })
      .where(eq(artistSessionResults.id, guestA.id));
    await db
      .update(artistSessionResults)
      .set({ timeTakenSeconds: 10 })
      .where(eq(artistSessionResults.id, guestB.id));

    const { entries, myBest } = await getArtistLeaderboard(412, {
      userId: null,
      guestId: 'guest-b',
    });

    expect(entries[0]?.displayName).toBe('Guest');
    expect(entries[0]?.totalGuessesUsed).toBe(10); // guest-b (fewer guesses) ranks first
    expect(entries[0]?.isYou).toBe(true);
    expect(entries[1]?.isYou).toBe(false);
    expect(myBest).toEqual({
      songsCorrect: 10,
      totalGuessesUsed: 10,
      timeTakenSeconds: 10,
    });
  });

  it('only counts completed sessions', async () => {
    const { challenge } = await getOrCreateArtistChallenge(412, '2026-01-01');
    const session = await getOrCreateSessionProgress(challenge.id, {
      userId: null,
      guestId: 'guest-incomplete',
    });
    await recordArtistRoundResult(session.id, true, 1, 1); // only 1 of 10 rounds played

    const { entries } = await getArtistLeaderboard(412, {
      userId: null,
      guestId: 'someone-else',
    });
    expect(entries).toHaveLength(0);
  });
});

describe('resolvePlayableRound', () => {
  it('returns the stored track when its preview is playable', async () => {
    const { tracks } = await getOrCreateArtistChallenge(412, '2026-03-01');
    const first = tracks[0]!;

    const resolved = await resolvePlayableRound(first, 412, false, [first.deezerTrackId]);

    expect(resolved?.track.deezerTrackId).toBe(first.deezerTrackId);
    expect(resolved?.previewUrl).toBe('https://example.test/preview.mp3');
  });

  it('substitutes another catalog track when the stored one has no preview, and persists it', async () => {
    const { challenge, tracks } = await getOrCreateArtistChallenge(412, '2026-03-02');
    const dead = tracks[0]!;

    // Only the challenge's own track is unplayable; everything else in the catalog is fine.
    vi.mocked(deezerService.getFreshPreviewUrl).mockImplementation(async (trackId: string) =>
      trackId === dead.deezerTrackId
        ? null
        : { previewUrl: `https://example.test/${trackId}.mp3`, durationSeconds: 200 },
    );

    const resolved = await resolvePlayableRound(
      dead,
      412,
      false,
      tracks.map((t) => t.deezerTrackId),
    );

    expect(resolved).not.toBeNull();
    expect(resolved!.track.deezerTrackId).not.toBe(dead.deezerTrackId);
    // The replacement must not duplicate a track already in the challenge.
    expect(tracks.map((t) => t.deezerTrackId)).not.toContain(resolved!.track.deezerTrackId);

    // The repair is written back, so the next player of this shared challenge sees the fix.
    const reloaded = await loadChallengeTracks(challenge.id);
    expect(reloaded[0]?.deezerTrackId).toBe(resolved!.track.deezerTrackId);
    expect(reloaded).toHaveLength(ARTIST_CHALLENGE_SIZE);
  });

  it('gives up and returns null when nothing in the catalog is playable', async () => {
    const { tracks } = await getOrCreateArtistChallenge(412, '2026-03-03');
    vi.mocked(deezerService.getFreshPreviewUrl).mockResolvedValue(null);

    const resolved = await resolvePlayableRound(
      tracks[0]!,
      412,
      false,
      tracks.map((t) => t.deezerTrackId),
    );

    expect(resolved).toBeNull();
  });
});

describe('getArtistGuessDistribution', () => {
  const identity = { userId: null, guestId: 'guest-dist' };

  async function completedSessionWithGuesses(stages: number[]) {
    const { challenge } = await getOrCreateArtistChallenge(412, '2026-04-01');
    const session = await getOrCreateSessionProgress(challenge.id, identity);
    await db
      .update(artistSessionResults)
      .set({ completed: true })
      .where(eq(artistSessionResults.id, session.id));

    await db.insert(artistRoundGuesses).values(
      stages.map((snippetStageSeconds, position) => ({
        sessionId: session.id,
        position,
        correct: true,
        snippetStageSeconds,
      })),
    );
  }

  it('returns counts as numbers, not the strings Postgres bigint yields', async () => {
    await completedSessionWithGuesses([1, 1, 4]);

    const buckets = await getArtistGuessDistribution(412, identity);

    // Asserting the runtime type explicitly: the row type is a hand-written assertion, so a
    // bigint coming back as "2" instead of 2 type-checks fine and only breaks in the browser.
    for (const bucket of buckets) {
      expect(typeof bucket.allPlayers).toBe('number');
      expect(typeof bucket.myGuesses).toBe('number');
    }

    // The exact failure this guards: summing buckets must add, not concatenate.
    const total = buckets.reduce((sum, b) => sum + b.allPlayers, 0);
    expect(total).toBe(3);
    expect(buckets.find((b) => b.snippetSeconds === 1)?.allPlayers).toBe(2);
    expect(buckets.find((b) => b.snippetSeconds === 4)?.allPlayers).toBe(1);
    expect(buckets.find((b) => b.snippetSeconds === 2)?.allPlayers).toBe(0);
  });

  it('reports zeroes for an artist with no completed guesses', async () => {
    const buckets = await getArtistGuessDistribution(999999, identity);
    expect(buckets).toHaveLength(6);
    expect(buckets.reduce((sum, b) => sum + b.allPlayers + b.myGuesses, 0)).toBe(0);
  });
});
