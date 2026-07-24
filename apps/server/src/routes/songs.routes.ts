import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { validate } from '../middleware/validate';
import { searchRateLimiter } from '../middleware/rateLimiters';

export const songsRouter = Router();

const searchSchema = z.object({
  q: z.string().trim().min(1).max(80),
});

/** Builds a safe FTS5 MATCH expression: quoted, prefix-matched tokens, capped in count. */
function buildFtsQuery(raw: string): string {
  const tokens = raw
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((token) => `"${token.replace(/"/g, '""')}"*`);
  return tokens.join(' ');
}

interface SongSearchRow {
  id: number;
  title: string;
  artist: string;
  albumArtUrl: string | null;
}

songsRouter.get('/search', searchRateLimiter, validate(searchSchema, 'query'), (req, res) => {
  const { q } = req.query as unknown as z.infer<typeof searchSchema>;
  const ftsQuery = buildFtsQuery(q);

  if (!ftsQuery) {
    res.json({ results: [] });
    return;
  }

  const rows = db.all<SongSearchRow>(sql`
    SELECT s.id as id, s.title as title, s.artist as artist, s.album_art_url as albumArtUrl
    FROM songs_fts
    JOIN songs s ON s.id = songs_fts.rowid
    WHERE songs_fts MATCH ${ftsQuery} AND s.active = 1
    ORDER BY rank
    LIMIT 8
  `);

  res.json({ results: rows });
});
