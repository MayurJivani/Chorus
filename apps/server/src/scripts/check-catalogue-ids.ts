/**
 * Pings every curated Deezer id and reports the dead ones.
 *
 *   npx tsx apps/server/src/scripts/check-catalogue-ids.ts
 *
 * Why this exists. The catalogue is a few hundred hand-picked album and playlist ids, and they
 * rot: Delhi Belly's soundtrack answered fine one morning and returned {"error":"no data"} the
 * same evening, with no replacement to point at. A dead id is invisible until somebody tries to
 * start a game, where it surfaces as "not enough playable tracks" — which reads as a broken
 * game rather than a source that went away.
 *
 * Exits non-zero when anything is dead or too thin to play, so a scheduled run can alert.
 * Deliberately a script rather than a server job: it is slow, it is bursty against a
 * rate-limited API, and nothing in a request path should depend on it.
 */
import { MOVIE_COLLECTIONS } from '../services/movies';
import { CATEGORIES } from '../services/categories';

/** Below this an album contributes so little that it is effectively absent from its collection. */
const MIN_ALBUM_TRACKS = 4;
/** A category draws ten rounds from one pool; under this it repeats itself or refuses to start. */
const MIN_PLAYLIST_TRACKS = 10;

/**
 * Deezer answers a quota breach with HTTP 200 and an error body, so a response has to be read
 * rather than trusted — and over a run this long the limiter is hit constantly.
 *
 * Patience here is the whole point of the tool. An impatient version reported 31 albums dead
 * across a 1831-id run and every one of them was alive on a calm retry; acting on that report
 * would have deleted 31 good albums from the catalogue. A false "dead" is far more expensive
 * than a slow check, so this backs off hard and only gives up after it has really tried.
 */
async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { Referer: 'https://chorusify.com/' } });
      const body = (await res.json()) as Record<string, unknown>;
      const error = body.error as { type?: string; code?: number } | undefined;
      // Quota and the generic "no data" both come back under load; only a repeated failure
      // across every attempt is evidence an id has actually gone.
      if (error) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return body;
    } catch {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return null;
}

interface Problem {
  kind: 'album' | 'playlist';
  owner: string;
  label: string;
  id: string;
  reason: string;
}

function playableCount(body: Record<string, unknown> | null): number | null {
  if (!body || body.error) return null;
  const tracks = body.tracks as { data?: { preview?: string | null }[] } | undefined;
  const data = tracks?.data;
  if (!data) return null;
  return data.filter((t) => t.preview).length;
}

async function main() {
  const problems: Problem[] = [];
  let albums = 0;
  let playlists = 0;

  for (const collection of MOVIE_COLLECTIONS) {
    for (const { movie, albumId } of collection.movies) {
      albums++;
      const body = await fetchJson(`https://api.deezer.com/album/${albumId}`);
      const n = playableCount(body);
      if (n === null) {
        problems.push({
          kind: 'album',
          owner: collection.label,
          label: movie,
          id: albumId,
          reason: 'dead or unreachable',
        });
      } else if (n < MIN_ALBUM_TRACKS) {
        problems.push({
          kind: 'album',
          owner: collection.label,
          label: movie,
          id: albumId,
          reason: `${n} playable tracks`,
        });
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  for (const category of CATEGORIES) {
    // Movie collections are categories too, but their albums are checked above.
    for (const playlistId of category.playlistIds) {
      playlists++;
      const body = await fetchJson(`https://api.deezer.com/playlist/${playlistId}`);
      const n = playableCount(body);
      if (n === null) {
        problems.push({
          kind: 'playlist',
          owner: category.group,
          label: category.label,
          id: playlistId,
          reason: 'dead or unreachable',
        });
      } else if (n < MIN_PLAYLIST_TRACKS) {
        // Only the first page is fetched, so this is "the top of the list is thin" rather than a
        // total — enough to flag a playlist that has collapsed, without paging all of them.
        problems.push({
          kind: 'playlist',
          owner: category.group,
          label: category.label,
          id: playlistId,
          reason: `${n} playable in the first page`,
        });
      }
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  console.log(`Checked ${albums} album ids and ${playlists} playlist ids.`);
  if (problems.length === 0) {
    console.log('All good — nothing dead or thin.');
    process.exit(0);
  }

  console.log(`\n${problems.length} problem(s):\n`);
  for (const p of problems) {
    console.log(`  [${p.kind}] ${p.owner} — ${p.label} (${p.id}): ${p.reason}`);
    console.log(`      https://api.deezer.com/${p.kind}/${p.id}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
