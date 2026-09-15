import { apiRequest } from './client';
import type { SoundtrackCollection } from '../types/api';

/**
 * Guess the Movie's collections.
 *
 * Discovery only. Playing a collection goes through the category endpoints, because a movie
 * collection *is* a category source on the server — that is what lets rounds, scoring,
 * multiplayer and duels work without a second copy of any of them. The split exists because
 * the two are different games to a player, not because they are different machinery.
 */
export async function getSoundtrackCollections(): Promise<SoundtrackCollection[]> {
  const res = await apiRequest<{ collections: SoundtrackCollection[] }>('/soundtracks');
  return res.collections;
}
