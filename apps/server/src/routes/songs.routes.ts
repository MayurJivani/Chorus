import { Router } from 'express';
import { z } from 'zod';
import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { songs } from '../db/schema';
import { validate } from '../middleware/validate';
import { searchRateLimiter } from '../middleware/rateLimiters';
import { asyncHandler } from '../middleware/asyncHandler';

export const songsRouter = Router();

const searchSchema = z.object({
  q: z.string().trim().min(1).max(80),
});

songsRouter.get(
  '/search',
  searchRateLimiter,
  validate(searchSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { q } = req.query as unknown as z.infer<typeof searchSchema>;

    // Guess autocomplete across title/artist: prefix ILIKE matches first, with a Postgres
    // full-text fallback (websearch_to_tsquery tolerates arbitrary user input) so a search
    // like "michael jackson" still finds an entry whose title doesn't start with the query.
    const prefix = `${q}%`;

    const rows = await db
      .select({
        id: songs.id,
        title: songs.title,
        artist: songs.artist,
        albumArtUrl: songs.albumArtUrl,
      })
      .from(songs)
      .where(
        and(
          eq(songs.active, true),
          or(
            sql`${songs.title} ILIKE ${prefix}`,
            sql`${songs.artist} ILIKE ${prefix}`,
            sql`to_tsvector('english', ${songs.title} || ' ' || ${songs.artist}) @@ websearch_to_tsquery('english', ${q})`,
          ),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${songs.title} ILIKE ${prefix} OR ${songs.artist} ILIKE ${prefix} THEN 0 ELSE 1 END`,
        songs.title,
      )
      .limit(8);

    res.json({ results: rows });
  }),
);
