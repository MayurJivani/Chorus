import { eq } from 'drizzle-orm';
import { db } from '../apps/server/src/db/client';
import { songs, type Song } from '../apps/server/src/db/schema';
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Deezer's preview URLs are short-lived signed links (they expire in minutes), so "is the
 * stored preview_url still reachable" is meaningless — nearly all of them will be expired by
 * the time this runs regardless of health. What actually matters is whether the *track* is
 * still available on Deezer at all (not taken down/delisted), which this checks via a live
 * lookup by id.
 */
async function trackStillAvailable(deezerTrackId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.deezer.com/track/${encodeURIComponent(deezerTrackId)}`, {
      headers: { Referer: 'https://chorus.app/' },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as DeezerTrackResponse;
    return Boolean(body.preview) && !body.error;
  } catch {
    return false;
  }
}

async function findFreshMatch(song: Song): Promise<DeezerSearchResponse['data'][number] | null> {
  const res = await fetch(
    `https://api.deezer.com/search?q=${encodeURIComponent(`${song.artist} ${song.title}`)}&limit=5`,
    { headers: { Referer: 'https://chorus.app/' } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as DeezerSearchResponse;
  return (
    body.data?.find((track) => Boolean(track.preview) && !isUnwantedVersion(track.title)) ?? null
  );
}

async function main(): Promise<void> {
  const activeSongs = db.select().from(songs).where(eq(songs.active, true)).all();
  const tally = { healthy: 0, refreshed: 0, deactivated: 0 };

  for (const song of activeSongs) {
    const label = `${song.artist} - ${song.title}`;
    const available = await trackStillAvailable(song.deezerTrackId);

    if (available) {
      db.update(songs)
        .set({ verifiedAt: new Date().toISOString() })
        .where(eq(songs.id, song.id))
        .run();
      tally.healthy += 1;
      console.log(`  ok ${label}`);
      await sleep(100);
      continue;
    }

    console.warn(`  unavailable: ${label}, searching for a replacement...`);
    const fresh = await findFreshMatch(song);

    if (fresh) {
      db.update(songs)
        .set({
          deezerTrackId: String(fresh.id),
          previewUrl: fresh.preview,
          albumArtUrl: fresh.album?.cover_medium ?? song.albumArtUrl,
          durationSeconds: fresh.duration,
          verifiedAt: new Date().toISOString(),
        })
        .where(eq(songs.id, song.id))
        .run();
      tally.refreshed += 1;
      console.log(`  ~ refreshed ${label}`);
    } else {
      db.update(songs).set({ active: false }).where(eq(songs.id, song.id)).run();
      tally.deactivated += 1;
      console.warn(`  x deactivated ${label} (no replacement found)`);
    }

    await sleep(150);
  }

  console.log('\nRe-verification complete:');
  console.log(`  healthy:     ${tally.healthy}`);
  console.log(`  refreshed:   ${tally.refreshed}`);
  console.log(`  deactivated: ${tally.deactivated}`);
}

main()
  .catch((err) => {
    console.error('Re-verification failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
