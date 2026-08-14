import { eq, or, sql } from 'drizzle-orm';
import { db } from '../apps/server/src/db/client';
import { songs, dailyPuzzles, gameResults, dailyPuzzleStarts } from '../apps/server/src/db/schema';
import { isUnwantedVersion } from '../apps/server/src/utils/trackFilters';

interface DeezerTrackResponse {
  id?: number;
  title?: string;
  preview?: string;
  duration?: number;
  artist?: { name: string };
  album?: { cover_medium?: string };
  error?: unknown;
}

interface DeezerSearchResponse {
  data: Array<
    Required<Pick<DeezerTrackResponse, 'id' | 'title' | 'preview' | 'duration'>> & {
      artist: { name: string };
      album?: { cover_medium?: string };
    }
  >;
}

const args = process.argv.slice(2);

function getArg(name: string): string | null {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx !== -1) {
    const val = args[idx + 1];
    if (val !== undefined && !val.startsWith('--')) {
      return val;
    }
  }
  const eqIdx = args.findIndex((a) => a.startsWith(`--${name}=`));
  if (eqIdx !== -1) {
    const arg = args[eqIdx];
    if (arg !== undefined) {
      const val = arg.split('=')[1];
      if (val !== undefined) {
        return val;
      }
    }
  }
  return null;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

async function fetchDeezerTrack(deezerId: string): Promise<DeezerTrackResponse | null> {
  try {
    const res = await fetch(`https://api.deezer.com/track/${encodeURIComponent(deezerId)}`, {
      headers: { Referer: 'https://chorus.app/' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as DeezerTrackResponse;
    if (body.error) return null;
    return body;
  } catch {
    return null;
  }
}

async function searchDeezer(query: string): Promise<DeezerSearchResponse['data']> {
  try {
    const res = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`,
      { headers: { Referer: 'https://chorus.app/' } },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as DeezerSearchResponse;
    return body.data ?? [];
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const dateStr = getArg('date') || new Date().toISOString().slice(0, 10);
  const songIdStr = getArg('song-id');
  const deezerIdStr = getArg('deezer-id');
  const queryStr = getArg('query');
  const forceReset = hasFlag('force-reset');

  if (!songIdStr && !deezerIdStr && !queryStr) {
    console.log(`
Usage: npm run change-daily-puzzle [options]

Options:
  --date <YYYY-MM-DD>  The puzzle date to change (defaults to today's UTC date: ${new Date().toISOString().slice(0, 10)})
  --song-id <id>       Change to song with the specified internal database ID
  --deezer-id <id>     Change to song with the specified Deezer Track ID (fetches and inserts if missing)
  --query <search>     Search database (and Deezer) for title/artist to use
  --force-reset        Reset user play history and starts for this daily puzzle so they can replay it

Examples:
  npm run change-daily-puzzle -- --query "Nirvana Smells Like Teen Spirit" --force-reset
  npm run change-daily-puzzle -- --date 2026-08-15 --deezer-id 1109731
  npm run change-daily-puzzle -- --song-id 42
`);
    return;
  }

  let chosenSongId: number | null = null;
  let songInfo = '';

  // 1. Resolve by internal Song ID
  if (songIdStr) {
    const id = parseInt(songIdStr, 10);
    if (isNaN(id)) {
      throw new Error(`Invalid song-id value: ${songIdStr}`);
    }
    const [match] = await db.select().from(songs).where(eq(songs.id, id)).limit(1);
    if (!match) {
      throw new Error(`No song found in database with ID: ${id}`);
    }
    chosenSongId = match.id;
    songInfo = `"${match.title}" by ${match.artist} (DB ID: ${match.id}, Deezer ID: ${match.deezerTrackId})`;
  }

  // 2. Resolve by Deezer Track ID
  if (!chosenSongId && deezerIdStr) {
    const [match] = await db
      .select()
      .from(songs)
      .where(eq(songs.deezerTrackId, deezerIdStr))
      .limit(1);
    if (match) {
      chosenSongId = match.id;
      songInfo = `"${match.title}" by ${match.artist} (DB ID: ${match.id}, Deezer ID: ${match.deezerTrackId})`;
    } else {
      console.log(`Deezer Track ID ${deezerIdStr} not found in DB. Fetching from Deezer API...`);
      const track = await fetchDeezerTrack(deezerIdStr);
      if (!track || !track.id || !track.title || !track.preview || !track.artist) {
        throw new Error(`Failed to fetch a valid track from Deezer for ID: ${deezerIdStr}`);
      }

      const [inserted] = await db
        .insert(songs)
        .values({
          title: track.title,
          artist: track.artist.name,
          deezerTrackId: String(track.id),
          previewUrl: track.preview,
          albumArtUrl: track.album?.cover_medium ?? null,
          durationSeconds: track.duration ?? 0,
          manualOverride: true,
          active: true,
        })
        .returning();

      if (!inserted) {
        throw new Error(`Failed to insert fetched track into DB`);
      }
      chosenSongId = inserted.id;
      songInfo = `"${inserted.title}" by ${inserted.artist} (DB ID: ${inserted.id}, Deezer ID: ${inserted.deezerTrackId}) [NEWLY CURATED]`;
    }
  }

  // 3. Resolve by Search Query
  if (!chosenSongId && queryStr) {
    console.log(`Searching database for: "${queryStr}"...`);
    const prefix = `%${queryStr}%`;
    const dbMatches = await db
      .select()
      .from(songs)
      .where(or(sql`${songs.title} ILIKE ${prefix}`, sql`${songs.artist} ILIKE ${prefix}`))
      .limit(5);

    const best = dbMatches[0];
    if (best) {
      chosenSongId = best.id;
      songInfo = `"${best.title}" by ${best.artist} (DB ID: ${best.id}, Deezer ID: ${best.deezerTrackId})`;
      console.log(`Found match in database: ${songInfo}`);
    } else {
      console.log(`No match in database. Searching Deezer...`);
      const results = await searchDeezer(queryStr);
      const withPreview = results.filter((track) => Boolean(track.preview));
      const clean = withPreview.filter((track) => !isUnwantedVersion(track.title));
      const bestDeezer = clean[0] || withPreview[0];

      if (!bestDeezer) {
        throw new Error(`No match found on Deezer either for: "${queryStr}"`);
      }

      // Check if this resolved track is actually already in our database under its deezerTrackId
      const deezerTrackId = String(bestDeezer.id);
      const [existing] = await db
        .select()
        .from(songs)
        .where(eq(songs.deezerTrackId, deezerTrackId))
        .limit(1);

      if (existing) {
        chosenSongId = existing.id;
        songInfo = `"${existing.title}" by ${existing.artist} (DB ID: ${existing.id}, Deezer ID: ${existing.deezerTrackId})`;
      } else {
        const [inserted] = await db
          .insert(songs)
          .values({
            title: bestDeezer.title,
            artist: bestDeezer.artist.name,
            deezerTrackId,
            previewUrl: bestDeezer.preview,
            albumArtUrl: bestDeezer.album?.cover_medium ?? null,
            durationSeconds: bestDeezer.duration,
            manualOverride: true,
            active: true,
          })
          .returning();

        if (!inserted) {
          throw new Error(`Failed to insert fetched track into DB`);
        }
        chosenSongId = inserted.id;
        songInfo = `"${inserted.title}" by ${inserted.artist} (DB ID: ${inserted.id}, Deezer ID: ${inserted.deezerTrackId}) [NEWLY CURATED]`;
      }
    }
  }

  if (!chosenSongId) {
    throw new Error('Could not resolve a song to use.');
  }

  console.log(`\nSelected Song: ${songInfo}`);
  console.log(`Target Date  : ${dateStr}`);

  // Find or create daily puzzle record
  const [existingPuzzle] = await db
    .select()
    .from(dailyPuzzles)
    .where(eq(dailyPuzzles.puzzleDate, dateStr))
    .limit(1);

  let puzzleId: number;

  if (existingPuzzle) {
    puzzleId = existingPuzzle.id;
    console.log(`Updating existing daily puzzle (ID: ${puzzleId})...`);
    await db
      .update(dailyPuzzles)
      .set({ songId: chosenSongId })
      .where(eq(dailyPuzzles.id, puzzleId));
  } else {
    console.log(`Creating new daily puzzle...`);
    const [inserted] = await db
      .insert(dailyPuzzles)
      .values({
        puzzleDate: dateStr,
        songId: chosenSongId,
      })
      .returning();
    if (!inserted) {
      throw new Error(`Failed to create daily puzzle`);
    }
    puzzleId = inserted.id;
  }

  if (forceReset) {
    console.log(`Clearing game results and starts for puzzle ID ${puzzleId}...`);
    const deletedStarts = await db
      .delete(dailyPuzzleStarts)
      .where(eq(dailyPuzzleStarts.puzzleId, puzzleId))
      .returning();
    const deletedResults = await db
      .delete(gameResults)
      .where(eq(gameResults.puzzleId, puzzleId))
      .returning();
    console.log(
      `Cleared ${deletedStarts.length} play starts and ${deletedResults.length} completion results.`,
    );
  }

  console.log(`\nSuccessfully set daily puzzle for ${dateStr}!`);
}

main()
  .catch((err) => {
    console.error('\nError:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void (async () => {
      const { sqlClient } = await import('../apps/server/src/db/client');
      await sqlClient.end().catch(() => undefined);
      process.exit(process.exitCode ?? 0);
    })();
  });
