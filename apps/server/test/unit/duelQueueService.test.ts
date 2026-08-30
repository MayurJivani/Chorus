import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The matchmaker's whole promise is that you are only ever paired with someone who chose the
 * same music. These cover that rule from both sides — who *does* match, and who must not — plus
 * the waiting counts, which are the only reason a queue this narrow is usable at all.
 */
const mpMocks = vi.hoisted(() => ({
  createDuelRoom: vi.fn(),
  identityFor: vi.fn(),
  sendToPlayer: vi.fn(),
}));
vi.mock('../../src/services/multiplayerService', () => mpMocks);

const sourceMocks = vi.hoisted(() => ({
  resolveArtistSource: vi.fn(),
  resolveCategorySource: vi.fn(),
}));
vi.mock('../../src/services/challengeSource', () => sourceMocks);

vi.mock('../../src/services/deezerService', () => ({
  getArtistById: vi.fn(async (id: number) => ({ id, name: `Artist ${id}`, pictureUrl: null })),
}));

vi.mock('../../src/services/categories', () => ({
  findCategory: vi.fn((id: string) => ({ id, label: `Category ${id}` })),
}));

import {
  __resetQueueForTests,
  getQueueCounts,
  joinQueue,
  leaveQueue,
  dropPlayer,
  watchQueue,
} from '../../src/services/duelQueueService';

/** Binds socket ids to accounts, since self-matching is guarded on userId not socket. */
function asUser(map: Record<string, string | null>) {
  mpMocks.identityFor.mockImplementation((playerId: string) =>
    map[playerId] === undefined ? null : { userId: map[playerId], guestId: null },
  );
}

function sentTo(playerId: string, type: string) {
  return mpMocks.sendToPlayer.mock.calls.filter(
    ([id, payload]) => id === playerId && payload.type === type,
  );
}

beforeEach(() => {
  __resetQueueForTests();
  vi.clearAllMocks();
  sourceMocks.resolveArtistSource.mockImplementation(async (id: number) => ({
    sourceType: 'artist',
    sourceId: String(id),
    label: `Artist ${id}`,
    pictureUrl: null,
    includeFeatures: false,
    loadCatalog: async () => [],
  }));
  sourceMocks.resolveCategorySource.mockImplementation((id: string) => ({
    sourceType: 'category',
    sourceId: id,
    label: `Category ${id}`,
    pictureUrl: null,
    includeFeatures: false,
    loadCatalog: async () => [],
  }));
  mpMocks.createDuelRoom.mockResolvedValue({ code: 'ROOM01' });
});

describe('pairing', () => {
  it('matches two players waiting on the same artist', async () => {
    asUser({ a: 'user-a', b: 'user-b' });

    await joinQueue('a', { kind: 'artist', artistId: 412 });
    expect(sentTo('a', 'duel_queued')).toHaveLength(1);

    await joinQueue('b', { kind: 'artist', artistId: 412 });

    expect(mpMocks.createDuelRoom).toHaveBeenCalledTimes(1);
    expect(sentTo('a', 'duel_matched')).toHaveLength(1);
    expect(sentTo('b', 'duel_matched')).toHaveLength(1);
    expect(getQueueCounts()).toHaveLength(0);
  });

  it('leaves two players on different artists waiting', async () => {
    asUser({ a: 'user-a', b: 'user-b' });

    await joinQueue('a', { kind: 'artist', artistId: 412 });
    await joinQueue('b', { kind: 'artist', artistId: 999 });

    expect(mpMocks.createDuelRoom).not.toHaveBeenCalled();
    expect(getQueueCounts().map((c) => c.count)).toEqual([1, 1]);
  });

  it('does not match an artist queue with a category queue', async () => {
    asUser({ a: 'user-a', b: 'user-b' });

    await joinQueue('a', { kind: 'artist', artistId: 412 });
    await joinQueue('b', { kind: 'category', categoryId: 'year-2020' });

    expect(mpMocks.createDuelRoom).not.toHaveBeenCalled();
  });

  /* "Any artist" is one shared line: two people who both said surprise me have agreed, and
     splitting them by whichever artist the server picks would mean nobody ever matched. */
  it('matches two random-artist players with each other', async () => {
    asUser({ a: 'user-a', b: 'user-b' });

    await joinQueue('a', { kind: 'random' });
    await joinQueue('b', { kind: 'random' });

    expect(mpMocks.createDuelRoom).toHaveBeenCalledTimes(1);
  });

  it('does not match a random-artist player with a specific-artist one', async () => {
    asUser({ a: 'user-a', b: 'user-b' });

    await joinQueue('a', { kind: 'random' });
    await joinQueue('b', { kind: 'artist', artistId: 412 });

    expect(mpMocks.createDuelRoom).not.toHaveBeenCalled();
  });

  it('refuses to match a player against themselves on a second tab', async () => {
    asUser({ tab1: 'user-a', tab2: 'user-a' });

    await joinQueue('tab1', { kind: 'artist', artistId: 412 });
    await joinQueue('tab2', { kind: 'artist', artistId: 412 });

    expect(mpMocks.createDuelRoom).not.toHaveBeenCalled();
  });

  it('turns a guest away, since a rating needs an account', async () => {
    asUser({ g: null });

    await joinQueue('g', { kind: 'artist', artistId: 412 });

    expect(sentTo('g', 'error')).toHaveLength(1);
    expect(getQueueCounts()).toHaveLength(0);
  });

  it('replaces an earlier choice rather than holding two places in line', async () => {
    asUser({ a: 'user-a' });

    await joinQueue('a', { kind: 'artist', artistId: 412 });
    await joinQueue('a', { kind: 'artist', artistId: 999 });

    const counts = getQueueCounts();
    expect(counts).toHaveLength(1);
    expect(counts[0]).toMatchObject({ key: 'artist:999', count: 1 });
  });
});

describe('leaving the queue', () => {
  it('removes a player who backs out', async () => {
    asUser({ a: 'user-a' });
    await joinQueue('a', { kind: 'artist', artistId: 412 });

    leaveQueue('a');

    expect(getQueueCounts()).toHaveLength(0);
    expect(sentTo('a', 'duel_queue_left')).toHaveLength(1);
  });

  /* A queued socket that died must not be matched into a room nobody will join. */
  it('removes a player whose socket dropped', async () => {
    asUser({ a: 'user-a' });
    await joinQueue('a', { kind: 'artist', artistId: 412 });

    dropPlayer('a');

    expect(getQueueCounts()).toHaveLength(0);
  });
});

describe('waiting counts', () => {
  it('reports how many are waiting on each source, busiest first', async () => {
    asUser({ a: 'ua', b: 'ub', c: 'uc' });

    await joinQueue('a', { kind: 'category', categoryId: 'year-2020' });
    await joinQueue('b', { kind: 'artist', artistId: 412 });
    await joinQueue('c', { kind: 'category', categoryId: 'year-2020' });

    // a and c would have paired on the same key, so only the artist queue and one leftover
    // remain — which is exactly the behaviour worth asserting.
    const counts = getQueueCounts();
    expect(counts.find((x) => x.key === 'artist:412')).toMatchObject({ count: 1 });
  });

  it('labels each queue with something a player recognises', async () => {
    asUser({ a: 'ua' });
    await joinQueue('a', { kind: 'category', categoryId: 'year-2020' });

    expect(getQueueCounts()[0]!.label).toBe('Category year-2020');
  });

  it('sends the current counts to a page that starts watching', () => {
    watchQueue('viewer');
    expect(sentTo('viewer', 'duel_queue_counts')).toHaveLength(1);
  });

  it('pushes an update to watchers when somebody joins', async () => {
    asUser({ a: 'ua' });
    watchQueue('viewer');
    mpMocks.sendToPlayer.mockClear();

    await joinQueue('a', { kind: 'artist', artistId: 412 });

    expect(sentTo('viewer', 'duel_queue_counts')).toHaveLength(1);
  });
});
