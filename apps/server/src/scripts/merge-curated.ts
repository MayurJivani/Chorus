/**
 * Merges a curator run into a collection in movies.ts.
 *
 *   npx tsx apps/server/src/scripts/merge-curated.ts <accepted.json> <BOLLYWOOD_MOVIES|HOLLYWOOD_MOVIES|SCORE_MOVIES|ANIME_TITLES|GAME_SOUNDTRACKS>
 *
 * Deduplicates on both the title and the album id, and the id check spans the *whole* file
 * rather than the target list: the same album appearing in two collections would make one
 * record the answer to two different names, which is a scoring bug rather than a tidiness one.
 *
 * Run `check-catalogue-ids.ts` afterwards, and audit a spread of what the curator accepted
 * before running this at all — the screen is good, not infallible, and its mistakes are silent.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Resolved from the repo rather than import.meta, which this build emits as CommonJS.
const MOVIES_TS = path.join(process.cwd(), 'apps/server/src/services/movies.ts');

async function main() {
  const [acceptedPath, listName] = process.argv.slice(2);
  if (!acceptedPath || !listName) {
    throw new Error('usage: merge-curated.ts <accepted.json> <LIST_NAME>');
  }

  const accepted = JSON.parse(await readFile(acceptedPath, 'utf8')) as {
    movie: string;
    albumId: string;
  }[];
  const source = await readFile(MOVIES_TS, 'utf8');

  const start = source.indexOf(`const ${listName}: SoundtrackTitle[] = [`);
  if (start === -1) throw new Error(`No list called ${listName} in movies.ts`);
  const end = source.indexOf('];', start);

  const section = source.slice(start, end);
  const haveTitles = new Set([...section.matchAll(/movie: ['"]([^'"]+)['"]/g)].map((m) => m[1]!));
  const haveIdsAnywhere = new Set([...source.matchAll(/albumId: '(\d+)'/g)].map((m) => m[1]!));

  const added: typeof accepted = [];
  for (const entry of accepted) {
    if (haveTitles.has(entry.movie) || haveIdsAnywhere.has(entry.albumId)) continue;
    haveTitles.add(entry.movie);
    haveIdsAnywhere.add(entry.albumId);
    added.push(entry);
  }

  const lines = added
    .map((a) => `  { movie: ${JSON.stringify(a.movie)}, albumId: '${a.albumId}' },\n`)
    .join('');
  await writeFile(MOVIES_TS, source.slice(0, end) + lines + source.slice(end));

  console.log(`Added ${added.length} of ${accepted.length} to ${listName}.`);
  console.log(`${listName} now has ${haveTitles.size} titles.`);
  console.log('Next: npx tsx apps/server/src/scripts/check-catalogue-ids.ts');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
