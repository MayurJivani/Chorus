/**
 * Guess the Movie's own endpoint.
 *
 * The collections are category *sources* underneath — that is what lets rounds, scoring,
 * multiplayer rooms, duels and leaderboards work without a second copy of any of it — but they
 * are not categories to a player. "Top Hits 2015" and "name the film from its score" are
 * different games, and listing them side by side made the movie collections read as four odd
 * entries in a list of eighty rather than a mode of their own.
 *
 * So the split is at the listing only: this router owns discovery, `/api/categories` no longer
 * returns movie collections, and play still goes through the category challenge endpoints.
 */
import { Router } from 'express';
import { MOVIE_COLLECTIONS } from '../services/movies';
import { playersBySource } from '../services/multiplayerService';
import { getQueueCounts } from '../services/duelQueueService';

export const moviesRouter = Router();

moviesRouter.get('/', (_req, res) => {
  const inRooms = playersBySource();
  const queued = getQueueCounts();

  res.json({
    collections: MOVIE_COLLECTIONS.map((c) => ({
      id: c.id,
      label: c.label,
      blurb: c.blurb,
      kind: c.kind,
      /** How many films are in play, which is the only real measure of a collection's size. */
      filmCount: c.movies.length,
      playing: inRooms[`category:${c.id}`] ?? 0,
      // Movie duels queue under their own key, so the count has to look there rather than at
      // `category:` — the same collection can have people in both lines at once.
      queued: queued.find((q) => q.key === `movie:${c.id}`)?.count ?? 0,
    })),
  });
});
