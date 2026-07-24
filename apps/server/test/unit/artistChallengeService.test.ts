import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/db/client';
import {
  artistChallenges,
  artistChallengeTracks,
  artistSessionResults,
  users,
} from '../../src/db/schema';
import * as deezerService from '../../src/services/deezerService';

vi.mock('../../src/services/deezerService', () => ({
  getArtistById: vi.fn(),
  getArtistTopTracks: vi.fn(),
}));

// Imported after the mock so the module under test picks up the mocked deezerService.
import {
  getOrCreateArtistChallenge,
  getOrCreateSessionProgress,
  recordArtistRoundResult,
  buildRoundOptions,
  getArtistLeaderboard,
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

beforeEach(() => {
  db.delete(artistSessionResults).run();
  db.delete(artistChallengeTracks).run();
  db.delete(artistChallenges).run();
  db.delete(users).run();
  vi.clearAllMocks();
  vi.mocked(deezerService.getArtistById).mockResolvedValue({
    id: 412,
    name: 'Queen',
    pictureUrl: null,
  });
  vi.mocked(deezerService.getArtistTopTracks).mockResolvedValue(mockTracks(20));
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
    const session = getOrCreateSessionProgress(challenge.id, { userId: null, guestId: 'guest-1' });

    expect(session.currentRound).toBe(0);
    expect(session.completed).toBe(false);

    const same = getOrCreateSessionProgress(challenge.id, { userId: null, guestId: 'guest-1' });
    expect(same.id).toBe(session.id);

    const result = recordArtistRoundResult(session.id, true, 2);
    expect(result.sessionComplete).toBe(false);
    expect(result.songsCorrect).toBe(1);
    expect(result.totalGuessesUsed).toBe(2);
  });

  it('marks the session complete after the final round', async () => {
    const { challenge } = await getOrCreateArtistChallenge(412, '2026-01-01');
    const session = getOrCreateSessionProgress(challenge.id, { userId: null, guestId: 'guest-2' });

    let lastResult = recordArtistRoundResult(session.id, true, 1);
    for (let round = 1; round < ARTIST_CHALLENGE_SIZE; round += 1) {
      lastResult = recordArtistRoundResult(session.id, round % 2 === 0, 3);
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

    const guestA = getOrCreateSessionProgress(challenge.id, { userId: null, guestId: 'guest-a' });
    const guestB = getOrCreateSessionProgress(challenge.id, { userId: null, guestId: 'guest-b' });

    for (let i = 0; i < ARTIST_CHALLENGE_SIZE; i += 1) recordArtistRoundResult(guestA.id, true, 2); // 10/10, 20 guesses
    for (let i = 0; i < ARTIST_CHALLENGE_SIZE; i += 1) recordArtistRoundResult(guestB.id, true, 1); // 10/10, 10 guesses

    const { entries, myBest } = getArtistLeaderboard(412, { userId: null, guestId: 'guest-b' });

    expect(entries[0]?.displayName).toBe('Guest');
    expect(entries[0]?.totalGuessesUsed).toBe(10); // guest-b (fewer guesses) ranks first
    expect(entries[0]?.isYou).toBe(true);
    expect(entries[1]?.isYou).toBe(false);
    expect(myBest).toEqual({
      songsCorrect: 10,
      totalGuessesUsed: 10,
      timeTakenSeconds: expect.any(Number),
    });
  });

  it('only counts completed sessions', async () => {
    const { challenge } = await getOrCreateArtistChallenge(412, '2026-01-01');
    const session = getOrCreateSessionProgress(challenge.id, {
      userId: null,
      guestId: 'guest-incomplete',
    });
    recordArtistRoundResult(session.id, true, 1); // only 1 of 10 rounds played

    const { entries } = getArtistLeaderboard(412, { userId: null, guestId: 'someone-else' });
    expect(entries).toHaveLength(0);
  });
});
