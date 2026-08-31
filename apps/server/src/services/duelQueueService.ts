/**
 * Live duel matchmaking.
 *
 * Players queue for a *specific* thing — one artist, one category, or "any artist" — and are
 * only ever paired with someone waiting on the same thing. That is the whole design constraint:
 * a duel is only meaningful if both sides chose to race over the same music, so the queue is a
 * set of independent lines rather than one pool with preferences.
 *
 * The obvious cost of exact matching is empty lines, which is why the waiting counts are pushed
 * to anyone looking at the page. Being told "3 waiting on Arijit Singh, nobody on Coldplay" is
 * what makes a narrow queue usable — without it, picking an artist is a guess about whether
 * anyone else is there, and a player who waits alone once tends not to come back.
 *
 * All state is in memory, like multiplayer rooms: a queue entry is meaningless the moment its
 * socket drops, so there is nothing worth persisting.
 */
import { createDuelRoom, identityFor, sendToPlayer } from './multiplayerService';
import { resolveArtistSource, resolveCategorySource } from './challengeSource';
import { findCategory } from './categories';
import { getArtistById } from './deezerService';
import { logger } from '../logger';

/** Artists used when someone asks for "any artist" — well known enough that most players will
 *  recognise at least some of the songs, and already warm in the catalog cache. */
const RANDOM_ARTISTS = [
  { id: 75798, name: 'Taylor Swift' },
  { id: 4050205, name: 'Bruno Mars' },
  { id: 246791, name: 'Ed Sheeran' },
  { id: 12246, name: 'Coldplay' },
  { id: 1562681, name: 'The Weeknd' },
  { id: 384236, name: 'Adele' },
  { id: 5575980, name: 'Billie Eilish' },
  { id: 4495513, name: 'Dua Lipa' },
  { id: 5080945, name: 'Post Malone' },
  { id: 288166, name: 'Arijit Singh' },
] as const;

export type DuelQueueRequest =
  | { kind: 'artist'; artistId: number }
  | { kind: 'category'; categoryId: string }
  /* Its own kind rather than a category, so movie duels are rated on their own ladder — being
     good at naming films is not the same skill as naming songs. */
  | { kind: 'movie'; collectionId: string }
  | { kind: 'random' };

/**
 * The line a player stands in. "random" is a single shared line rather than one per artist —
 * two people who both said "surprise me" have agreed on the same thing, and splitting them by
 * the artist the server happens to pick would mean nobody ever matched.
 */
function queueKey(request: DuelQueueRequest): string {
  switch (request.kind) {
    case 'artist':
      return `artist:${request.artistId}`;
    case 'category':
      return `category:${request.categoryId}`;
    case 'movie':
      return `movie:${request.collectionId}`;
    case 'random':
      return 'random';
  }
}

interface Waiting {
  playerId: string;
  userId: string;
  request: DuelQueueRequest;
  key: string;
  label: string;
  joinedAt: number;
}

/** One entry per waiting player, keyed by socket id so a disconnect can drop it in O(1). */
const waiting = new Map<string, Waiting>();
/** Sockets watching the counts (i.e. sitting on the duels page), whether queued or not. */
const watchers = new Set<string>();

export interface QueueCount {
  key: string;
  label: string;
  count: number;
}

export function getQueueCounts(): QueueCount[] {
  const byKey = new Map<string, QueueCount>();
  for (const entry of waiting.values()) {
    const existing = byKey.get(entry.key);
    if (existing) existing.count += 1;
    else byKey.set(entry.key, { key: entry.key, label: entry.label, count: 1 });
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function broadcastCounts(): void {
  const counts = getQueueCounts();
  const total = waiting.size;
  for (const playerId of watchers) {
    sendToPlayer(playerId, { type: 'duel_queue_counts', counts, total });
  }
}

export function watchQueue(playerId: string): void {
  watchers.add(playerId);
  sendToPlayer(playerId, {
    type: 'duel_queue_counts',
    counts: getQueueCounts(),
    total: waiting.size,
  });
}

export function unwatchQueue(playerId: string): void {
  watchers.delete(playerId);
}

/** Drops a player from the line. Safe to call for someone who was never in it. */
export function leaveQueue(playerId: string, silent = false): void {
  if (!waiting.delete(playerId)) return;
  if (!silent) sendToPlayer(playerId, { type: 'duel_queue_left' });
  broadcastCounts();
}

/** Called on socket close — a queued player who vanished must not be matched into a dead room. */
export function dropPlayer(playerId: string): void {
  watchers.delete(playerId);
  if (waiting.delete(playerId)) broadcastCounts();
}

async function describe(request: DuelQueueRequest): Promise<string> {
  switch (request.kind) {
    case 'artist': {
      const artist = await getArtistById(request.artistId).catch(() => null);
      return artist?.name ?? `Artist ${request.artistId}`;
    }
    case 'category':
      return findCategory(request.categoryId)?.label ?? request.categoryId;
    case 'movie':
      return findCategory(request.collectionId)?.label ?? request.collectionId;
    case 'random':
      return 'Any artist';
  }
}

/**
 * Joins the queue, pairing immediately if someone compatible is already waiting.
 *
 * Accounts only, and never against yourself: a rating you can farm from a second tab is not a
 * rating. The self-match guard is on `userId` rather than socket id for exactly that reason.
 */
export async function joinQueue(playerId: string, request: DuelQueueRequest): Promise<void> {
  const identity = identityFor(playerId);
  if (!identity?.userId) {
    sendToPlayer(playerId, {
      type: 'error',
      message: 'Duels are rated, so they need an account.',
    });
    return;
  }

  // Re-queueing replaces the old entry rather than stacking a second one.
  waiting.delete(playerId);

  const key = queueKey(request);
  const label = await describe(request);

  const partner = [...waiting.values()].find((w) => w.key === key && w.userId !== identity.userId);

  if (!partner) {
    waiting.set(playerId, {
      playerId,
      userId: identity.userId,
      request,
      key,
      label,
      joinedAt: Date.now(),
    });
    sendToPlayer(playerId, { type: 'duel_queued', key, label });
    broadcastCounts();
    logger.info({ playerId, key }, 'Duel queue: waiting');
    return;
  }

  waiting.delete(partner.playerId);
  broadcastCounts();

  try {
    const source = await resolveSource(request);
    // The queue kind *is* the rating ladder — you are rated on the thing you chose to race.
    const { code } = await createDuelRoom(source, partner.userId, identity.userId, request.kind);

    for (const side of [partner.playerId, playerId]) {
      sendToPlayer(side, { type: 'duel_matched', code, label: source.label });
    }
    logger.info({ key, code, a: partner.userId, b: identity.userId }, 'Duel queue: matched');
  } catch (err) {
    logger.error({ err, key }, 'Duel queue: failed to create room after matching');
    for (const side of [partner.playerId, playerId]) {
      sendToPlayer(side, {
        type: 'error',
        message: 'Found an opponent but could not start the duel. Please try again.',
      });
    }
  }
}

/** Resolves a queue request into the pool the duel will be played from. */
async function resolveSource(request: DuelQueueRequest) {
  if (request.kind === 'category') return resolveCategorySource(request.categoryId);
  // Movie collections resolve through the same category source: the pool differs, the game does not.
  if (request.kind === 'movie') return resolveCategorySource(request.collectionId);
  const artistId =
    request.kind === 'artist'
      ? request.artistId
      : RANDOM_ARTISTS[Math.floor(Math.random() * RANDOM_ARTISTS.length)]!.id;
  return resolveArtistSource(artistId, false);
}

/** Test hook — clears the queue between suites. */
export function __resetQueueForTests(): void {
  waiting.clear();
  watchers.clear();
}
