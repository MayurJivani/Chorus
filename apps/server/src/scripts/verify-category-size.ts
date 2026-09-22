/**
 * Reports the real, deduplicated size of a category's playlist set.
 *
 *   npx tsx apps/server/src/scripts/verify-category-size.ts
 *   npx tsx apps/server/src/scripts/verify-category-size.ts genre-rock-essentials
 *
 * find-playlists.ts reports what each playlist *claims* to hold, which is the wrong number to
 * plan with: several lists all called "best of 2016" overlap heavily, and the pool builder drops
 * remixes, live cuts and duplicate songs on top of that. A category can look like 700 tracks in
 * search results and be 180 once merged.
 *
 * This applies the same filter and dedupe key the real pool builder uses, so the count it prints
 * is the count a player would actually draw from. Read-only: it touches Deezer and nothing else,
 * so it can be run against a proposed set before any of it is committed.
 */
import { CATEGORIES } from '../services/categories';
import {
  isUnwantedVersion,
  normalizeTitle,
  stripAnyTrailingQualifier,
} from '../utils/trackFilters';

const TARGET = 250;

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { Referer: 'https://chorusify.com/' } });
      const body = (await res.json()) as Record<string, unknown>;
      if (body.error) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      return body;
    } catch {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  return null;
}

interface Track {
  title: string;
  artist: string;
}

/** Walks a playlist's pages; Deezer caps a page at 100 regardless of how big the list is. */
async function playlistTracks(id: string): Promise<Track[]> {
  const out: Track[] = [];
  for (let index = 0; index < 2000; index += 100) {
    const body = await fetchJson(
      `https://api.deezer.com/playlist/${id}/tracks?index=${index}&limit=100`,
    );
    const data = (body?.data ?? []) as { title?: string; artist?: { name?: string } }[];
    if (data.length === 0) break;
    for (const t of data) {
      if (t.title) out.push({ title: t.title, artist: t.artist?.name ?? '' });
    }
    if (data.length < 100) break;
  }
  return out;
}

async function main() {
  const only = process.argv[2];
  const targets = CATEGORIES.filter(
    (c) => c.playlistIds.length > 0 && (only ? c.id === only : true),
  );

  const short: string[] = [];

  for (const category of targets) {
    const all: Track[] = [];
    for (const id of category.playlistIds) all.push(...(await playlistTracks(id)));

    // The same key the category pool builder uses: artist *and* title, because a category spans
    // many artists and two of them can legitimately share a song name.
    const kept = new Map<string, Track>();
    for (const t of all) {
      if (isUnwantedVersion(t.title)) continue;
      const key = `${normalizeTitle(t.artist)}|${normalizeTitle(stripAnyTrailingQualifier(t.title))}`;
      if (!kept.has(key)) kept.set(key, t);
    }

    const flag = kept.size >= TARGET ? 'ok  ' : 'THIN';
    console.log(
      `${flag} ${category.id.padEnd(32)} ${String(kept.size).padStart(5)} unique  ` +
        `(${all.length} raw, ${category.playlistIds.length} playlist(s))`,
    );
    if (kept.size < TARGET) short.push(category.id);

    // A few real rows, because a healthy count built from the wrong music is still wrong.
    if (only) {
      for (const t of [...kept.values()].slice(0, 12)) {
        console.log(`       ${t.artist} - ${t.title}`);
      }
    }
  }

  if (short.length) {
    console.log(`\n${short.length} still under ${TARGET}:`);
    console.log('  ' + short.join(' '));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
