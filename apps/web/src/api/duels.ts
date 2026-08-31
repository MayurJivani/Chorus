/**
 * Duels are live now, so joining one is a WebSocket conversation (see useDuelQueue), not a REST
 * call. What is left here is history, the rating board, and a first-paint snapshot of the queue.
 */
import { apiRequest } from './client';
import type { DuelQueueCount, DuelView, RatingLeaderboard } from '../types/api';

export function getDuel(duelId: number): Promise<DuelView> {
  return apiRequest<DuelView>(`/duels/${duelId}`);
}

export async function getMyDuels(): Promise<DuelView[]> {
  const res = await apiRequest<{ duels: DuelView[] }>('/duels/mine');
  return res.duels;
}

/** Ranked per mode — a combined board would compare numbers earned in different games. */
/** Rating ladders. Separate on purpose: naming a film is not the same skill as naming a song. */
export type DuelMode = 'artist' | 'category' | 'random' | 'movie';

export function getRatingLeaderboard(mode: DuelMode = 'artist'): Promise<RatingLeaderboard> {
  return apiRequest<RatingLeaderboard>(`/duels/leaderboard?mode=${mode}`);
}

/**
 * Queue counts for the first render.
 *
 * The socket keeps these live; this only exists so the page doesn't show an empty queue while
 * the socket opens — "nobody is waiting" is the one message that would stop a player queuing.
 */
export function getQueueSnapshot(): Promise<{ counts: DuelQueueCount[]; total: number }> {
  return apiRequest<{ counts: DuelQueueCount[]; total: number }>('/duels/queue');
}
