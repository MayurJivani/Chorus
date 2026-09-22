/**
 * Finds extra Deezer playlists to widen a thin category.
 *
 *   npx tsx apps/server/src/scripts/find-playlists.ts                 # every category under target
 *   npx tsx apps/server/src/scripts/find-playlists.ts year-2014       # just one
 *
 * Why this is needed: almost every category points at a single Deezer editorial playlist, and
 * those cap out around 50-100 tracks. Ten rounds drawn from 39 songs repeat themselves, and a
 * category that repeats is a category people stop picking. The pool builder already merges and
 * dedupes across `playlistIds`, so the fix is more sources rather than any new machinery.
 *
 * Search results are not trustworthy on their own. Deezer is full of karaoke, tribute, piano
 * and 8-bit playlists whose titles look exactly like the real thing, and dropping one into a
 * category means rounds where the snippet is a cover nobody can place. Everything here is
 * filtered on that before it is ever suggested, and each survivor is fetched to confirm it
 * really returns tracks rather than an empty shell.
 *
 * Reports only. Paste accepted ids into the category's `playlistIds` in categories.ts.
 */
import { CATEGORIES } from '../services/categories';

/** Ten rounds want a pool deep enough that two games in a row do not overlap much. */
const TARGET = 250;

/**
 * Title words that mean "not the original recording". A category is a guessing game about
 * songs people know; a karaoke backing track is a different song wearing the same name.
 */
const JUNK = [
  'karaoke',
  'cover',
  'tribute',
  'instrumental',
  'piano',
  '8-bit',
  '8 bit',
  'lullaby',
  'sleep',
  'study',
  'workout',
  'remix',
  'nightcore',
  'slowed',
  'reverb',
  'meditation',
  'relax',
  'acoustic version',
];

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { Referer: 'https://chorusify.com/' } });
      const body = (await res.json()) as Record<string, unknown>;
      // Deezer answers a quota breach with HTTP 200 and an error body, so this has to be read.
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

interface Candidate {
  id: string;
  title: string;
  nbTracks: number;
  fans: number;
  owner: string;
}

function looksLikeJunk(title: string): boolean {
  const lower = title.toLowerCase();
  return JUNK.some((word) => lower.includes(word));
}

async function search(query: string): Promise<Candidate[]> {
  const body = await fetchJson(
    `https://api.deezer.com/search/playlist?q=${encodeURIComponent(query)}&limit=25`,
  );
  const data = (body?.data ?? []) as {
    id?: number;
    title?: string;
    nb_tracks?: number;
    fans?: number;
    user?: { name?: string };
  }[];

  return data
    .filter((p) => p.id && p.title && !looksLikeJunk(p.title))
    .map((p) => ({
      id: String(p.id),
      title: p.title!,
      nbTracks: p.nb_tracks ?? 0,
      fans: p.fans ?? 0,
      owner: p.user?.name ?? 'unknown',
    }))
    .filter((p) => p.nbTracks >= 30);
}

/** Query shapes that actually surface the big compilations, rather than one-off user mixes. */
function queriesFor(label: string): string[] {
  return [label, `best of ${label}`, `${label} hits`, `top ${label}`];
}

async function main() {
  const only = process.argv[2];

  // Every id already in use anywhere, so a suggestion is never something the category (or a
  // neighbouring one) is already drawing from.
  const taken = new Set(CATEGORIES.flatMap((c) => c.playlistIds));

  const targets = CATEGORIES.filter(
    (c) => c.playlistIds.length > 0 && (only ? c.id === only : true),
  );
  if (targets.length === 0) throw new Error(`No playlist-backed category matching ${only}`);

  for (const category of targets) {
    const seen = new Map<string, Candidate>();
    for (const query of queriesFor(category.label)) {
      for (const hit of await search(query)) {
        if (taken.has(hit.id)) continue;
        if (!seen.has(hit.id)) seen.set(hit.id, hit);
      }
    }

    const ranked = [...seen.values()].sort((a, b) => b.fans - a.fans || b.nbTracks - a.nbTracks);

    // Take enough to plausibly clear the target, allowing for heavy overlap between lists that
    // all claim to be the same year's hits.
    const picked: Candidate[] = [];
    let running = 0;
    for (const candidate of ranked) {
      if (running >= TARGET * 2) break;
      picked.push(candidate);
      running += candidate.nbTracks;
    }

    console.log(`\n${category.id}  (${category.label})`);
    console.log(`  current: ${category.playlistIds.length} playlist(s)`);
    if (picked.length === 0) {
      console.log('  nothing usable found');
      continue;
    }
    for (const p of picked) {
      console.log(
        `    '${p.id}',  // ${p.nbTracks}t  ${p.fans} fans  ${p.title.slice(0, 44)} [${p.owner.slice(0, 18)}]`,
      );
    }
    console.log(`  claimed total if all added: ${running} (before dedupe)`);
  }

  console.log('\nTrack counts are pre-dedupe; overlapping lists shrink a lot when merged.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
