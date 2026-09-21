/**
 * Ranks every curated title by how much its soundtrack is actually listened to.
 *
 *   npx tsx apps/server/src/scripts/rank-titles.ts
 *   npx tsx apps/server/src/scripts/rank-titles.ts BOLLYWOOD_MOVIES
 *
 * The curator answers "is this a real soundtrack album" and remove-titles.ts answers "does this
 * belong in this collection". Neither answers "would anyone recognise it", and that is its own
 * kind of wrong: a round nobody can place is indistinguishable from a broken round. A catalogue
 * padded with albums no one has heard makes the game feel unfair rather than deep.
 *
 * The signal is the median Deezer `rank` of the album's tracks, not the album's `fans` count,
 * which is almost always 0 for soundtrack compilations. Median rather than mean so one breakout
 * single cannot carry an otherwise unknown album - that is exactly the case worth catching,
 * since the game draws a random track and will usually not draw the hit.
 *
 * Prints ascending, so the head of the list is the cut candidate. Deliberately reports rather
 * than deletes: feed the names you accept into remove-titles.ts, which is the tool that edits.
 */
import { SOUNDTRACK_COLLECTIONS } from '../services/soundtracks';

/** Matches the catalogue health check: Deezer answers a quota breach with HTTP 200 and an error
 *  body, and over a run this long the limiter is hit constantly. */
async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { Referer: 'https://chorusify.com/' } });
      const body = (await res.json()) as Record<string, unknown>;
      if (body.error) {
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

const CONCURRENCY = 4;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

interface Scored {
  movie: string;
  albumId: string;
  medianRank: number;
  trackCount: number;
}

async function scoreCollection(label: string, titles: { movie: string; albumId: string }[]) {
  const scored: Scored[] = [];
  let done = 0;

  const queue = [...titles];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const body = await fetchJson(`https://api.deezer.com/album/${next.albumId}`);
        const tracks = ((body?.tracks as { data?: { rank?: number }[] })?.data ?? []).map(
          (t) => t.rank ?? 0,
        );
        scored.push({
          movie: next.movie,
          albumId: next.albumId,
          // An album that would not answer is reported as 0 so it surfaces at the top for a
          // human to look at, rather than being silently dropped from the report.
          medianRank: median(tracks),
          trackCount: tracks.length,
        });
        done += 1;
        if (done % 25 === 0) process.stdout.write(`\r  ${label}: ${done}/${titles.length}`);
      }
    }),
  );

  process.stdout.write(`\r  ${label}: ${done}/${titles.length}\n`);
  return scored.sort((a, b) => a.medianRank - b.medianRank);
}

async function main() {
  const only = process.argv[2];

  for (const collection of SOUNDTRACK_COLLECTIONS) {
    const listName = collection.label;
    if (only && !listName.toLowerCase().includes(only.toLowerCase().replace(/_movies|_.*/g, ''))) {
      continue;
    }

    console.log(`\n=== ${listName} (${collection.titles.length} titles) ===`);
    const scored = await scoreCollection(listName, collection.titles);

    const quartile = scored[Math.floor(scored.length * 0.25)]?.medianRank ?? 0;
    console.log(`  lower-quartile median rank: ${quartile}\n`);
    console.log('  weakest 60:');
    for (const s of scored.slice(0, 60)) {
      console.log(`    ${String(s.medianRank).padStart(7)}  ${s.trackCount}t  ${s.movie}`);
    }
  }

  console.log(
    '\nRank is Deezer plays, roughly 0-1000000. Feed accepted names to remove-titles.ts.',
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
