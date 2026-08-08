/**
 * Exports the active daily-puzzle song pool (the hand-curated all-time list plus
 * the current Top Worldwide chart) as JSON, deduped and sorted, for the frontend
 * or external consumers. Usage: npm run export:pool -- [output path]
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { db } from './client';
import { songs } from './schema';
import { logger } from '../logger';

async function run(): Promise<void> {
  const rows = await db
    .select({
      id: songs.id,
      title: songs.title,
      artist: songs.artist,
      deezerTrackId: songs.deezerTrackId,
      albumArtUrl: songs.albumArtUrl,
      durationSeconds: songs.durationSeconds,
      pinned: songs.manualOverride,
    })
    .from(songs)
    .where(eq(songs.active, true))
    .orderBy(asc(songs.artist), asc(songs.title));

  const payload = {
    exportedAt: new Date().toISOString(),
    count: rows.length,
    songs: rows,
  };

  const out = resolve(process.argv[2] ?? 'pool.json');
  await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  logger.info({ count: rows.length, file: out }, 'Exported active song pool');
}

void run().catch((err) => {
  logger.error({ err }, 'Song pool export failed');
  process.exit(1);
});
