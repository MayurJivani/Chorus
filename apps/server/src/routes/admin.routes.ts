/**
 * Admin tools for the daily challenge schedule.
 *
 * The daily puzzle is normally picked automatically — `getOrCreateDailyPuzzle` hashes the date
 * into the curated song bank — which is fine until a specific day needs a specific song, or a
 * song turns out to be a bad pick. These routes make the schedule visible and editable without
 * anyone having to open a psql prompt.
 *
 * Two rules run through everything here:
 *  - A puzzle that people have already played is *history*, not schedule. Editing or deleting it
 *    would orphan or silently rewrite their results, so it is refused outright.
 *  - The past is never editable, even if unplayed, because there is nothing to gain from it.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, gte, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { dailyPuzzles, gameResults, songs } from '../db/schema';
import { getUtcDateString } from '../services/puzzleService';
import { requireAdmin } from '../middleware/requireAdmin';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

const dateParamsSchema = z.object({
  // A calendar date, not a free-form string: the puzzle_date column is the schedule's key.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date'),
});

const listQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * The scheduled daily puzzles, newest first, each with its song and how many people have
 * finished it — the play count is what tells an admin whether a row is still safe to change.
 */
adminRouter.get(
  '/daily-puzzles',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { from, limit = 60 } = req.query as unknown as z.infer<typeof listQuerySchema>;

    const rows = await db
      .select({
        id: dailyPuzzles.id,
        puzzleDate: dailyPuzzles.puzzleDate,
        songId: songs.id,
        title: songs.title,
        artist: songs.artist,
        albumArtUrl: songs.albumArtUrl,
        active: songs.active,
        manualOverride: songs.manualOverride,
        plays: sql<number>`(
          SELECT COUNT(*)::int FROM game_results gr WHERE gr.puzzle_id = ${dailyPuzzles.id}
        )`,
      })
      .from(dailyPuzzles)
      .innerJoin(songs, eq(songs.id, dailyPuzzles.songId))
      .where(from ? gte(dailyPuzzles.puzzleDate, from) : undefined)
      .orderBy(desc(dailyPuzzles.puzzleDate))
      .limit(limit);

    res.json({ today: getUtcDateString(), puzzles: rows });
  }),
);

/** The song bank, filtered by title or artist. Curated songs first — those are the ones the
 *  automatic picker actually draws from, so they are what an admin usually wants. */
adminRouter.get(
  '/songs',
  validate(z.object({ q: z.string().trim().max(80).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const { q } = req.query as { q?: string };

    const rows = await db
      .select({
        id: songs.id,
        title: songs.title,
        artist: songs.artist,
        albumArtUrl: songs.albumArtUrl,
        active: songs.active,
        manualOverride: songs.manualOverride,
      })
      .from(songs)
      .where(q ? or(ilike(songs.title, `%${q}%`), ilike(songs.artist, `%${q}%`)) : undefined)
      .orderBy(desc(songs.manualOverride), asc(songs.artist), asc(songs.title))
      .limit(50);

    res.json({ songs: rows });
  }),
);

async function countPlays(puzzleId: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(gameResults)
    .where(eq(gameResults.puzzleId, puzzleId));
  return rows[0]?.count ?? 0;
}

/**
 * Rejects any edit that would rewrite history: a past date, or a puzzle somebody has finished.
 * Returns the existing row (if any) so callers don't have to look it up twice.
 */
async function assertEditable(date: string) {
  if (date < getUtcDateString()) {
    throw new HttpError(409, 'That date has already passed — past puzzles are read-only');
  }

  const rows = await db
    .select()
    .from(dailyPuzzles)
    .where(eq(dailyPuzzles.puzzleDate, date))
    .limit(1);
  const existing = rows[0];
  if (!existing) return null;

  const plays = await countPlays(existing.id);
  if (plays > 0) {
    throw new HttpError(
      409,
      `${plays} ${plays === 1 ? 'person has' : 'people have'} already played that puzzle — it can no longer be changed`,
    );
  }
  return existing;
}

/** Schedules (or re-points) the puzzle for a date. */
adminRouter.put(
  '/daily-puzzles/:date',
  validate(dateParamsSchema, 'params'),
  validate(z.object({ songId: z.number().int().positive() })),
  asyncHandler(async (req, res) => {
    const { date } = req.params as unknown as z.infer<typeof dateParamsSchema>;
    const { songId } = req.body as { songId: number };

    const existing = await assertEditable(date);

    const songRows = await db.select().from(songs).where(eq(songs.id, songId)).limit(1);
    const song = songRows[0];
    if (!song) throw new HttpError(404, 'No such song');
    if (!song.active) {
      throw new HttpError(409, 'That song is inactive — reactivate it before scheduling it');
    }

    if (existing) {
      await db.update(dailyPuzzles).set({ songId }).where(eq(dailyPuzzles.id, existing.id));
    } else {
      await db.insert(dailyPuzzles).values({ puzzleDate: date, songId });
    }

    res.json({
      ok: true,
      puzzleDate: date,
      song: { id: song.id, title: song.title, artist: song.artist },
    });
  }),
);

/**
 * Unschedules a date. The automatic picker fills it back in the next time anyone opens that
 * day, so this is "re-roll this day", not "delete the day".
 */
adminRouter.delete(
  '/daily-puzzles/:date',
  validate(dateParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { date } = req.params as unknown as z.infer<typeof dateParamsSchema>;

    const existing = await assertEditable(date);
    if (!existing) throw new HttpError(404, 'Nothing is scheduled for that date');

    await db.delete(dailyPuzzles).where(eq(dailyPuzzles.id, existing.id));
    res.json({ ok: true });
  }),
);

/**
 * Curation flags for a song. `manualOverride` is what puts a song in the daily picker's pool;
 * `active` withdraws it from the game entirely.
 */
adminRouter.patch(
  '/songs/:songId',
  validate(z.object({ songId: z.coerce.number().int().positive() }), 'params'),
  validate(z.object({ active: z.boolean().optional(), manualOverride: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    const { songId } = req.params as unknown as { songId: number };
    const patch = req.body as { active?: boolean; manualOverride?: boolean };

    if (patch.active === undefined && patch.manualOverride === undefined) {
      throw new HttpError(400, 'Nothing to change');
    }

    const updated = await db.update(songs).set(patch).where(eq(songs.id, songId)).returning({
      id: songs.id,
      title: songs.title,
      artist: songs.artist,
      active: songs.active,
      manualOverride: songs.manualOverride,
    });

    const song = updated[0];
    if (!song) throw new HttpError(404, 'No such song');
    res.json({ song });
  }),
);

/** Headline counts, so the admin page can show whether curation is in a healthy state. */
adminRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
        active: sql<number>`COUNT(*) FILTER (WHERE ${songs.active})::int`,
        curated: sql<number>`COUNT(*) FILTER (WHERE ${songs.active} AND ${songs.manualOverride})::int`,
      })
      .from(songs);

    const scheduled = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(dailyPuzzles)
      .where(and(gte(dailyPuzzles.puzzleDate, getUtcDateString())));

    res.json({
      songs: rows[0] ?? { total: 0, active: 0, curated: 0 },
      scheduledFromToday: scheduled[0]?.count ?? 0,
      today: getUtcDateString(),
    });
  }),
);
