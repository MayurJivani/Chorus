/**
 * Removes titles from a soundtrack collection.
 *
 *   npx tsx apps/server/src/scripts/remove-titles.ts BOLLYWOOD_MOVIES "Baahubali" "Jailer"
 *   npx tsx apps/server/src/scripts/remove-titles.ts HOLLYWOOD_MOVIES --file wrong.txt
 *
 * The counterpart to merge-curated.ts, and needed for the same reason that exists: the bulk
 * curator screens for "is this a real soundtrack album", which it does well, but it has no idea
 * whether a film belongs in the collection it was screened into. A Telugu film in Bollywood and
 * an anime in Hollywood both pass every check and are still wrong.
 *
 * Prints what it removed and what it could not find, because a silent no-op on a typo'd title
 * looks exactly like a successful removal.
 *
 * Titles are matched case-insensitively and ignoring punctuation, so the name as it appears in
 * the game is enough — no need to match the source file's exact quoting.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOUNDTRACKS_TS = path.join(process.cwd(), 'apps/server/src/services/soundtracks.ts');

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function main() {
  const [listName, ...rest] = process.argv.slice(2);
  if (!listName) {
    throw new Error(
      'usage: remove-titles.ts <LIST_NAME> <title...>\n' +
        '   or: remove-titles.ts <LIST_NAME> --file titles.txt',
    );
  }

  let wanted: string[];
  if (rest[0] === '--file') {
    const file = rest[1];
    if (!file) throw new Error('--file needs a path');
    wanted = (await readFile(file, 'utf8'))
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } else {
    wanted = rest;
  }
  if (wanted.length === 0) throw new Error('No titles given');

  const source = await readFile(SOUNDTRACKS_TS, 'utf8');
  const start = source.indexOf(`const ${listName}: SoundtrackTitle[] = [`);
  if (start === -1) throw new Error(`No list called ${listName} in soundtracks.ts`);
  const end = source.indexOf('];', start);

  const head = source.slice(0, start);
  const section = source.slice(start, end);
  const tail = source.slice(end);

  const targets = new Set(wanted.map(norm));
  const seen = new Set<string>();
  const removed: string[] = [];

  const kept = section.split('\n').filter((line) => {
    const match = /movie: ['"]([^'"]+)['"]/.exec(line);
    if (!match) return true;
    const title = match[1]!;
    const key = norm(title);
    if (!targets.has(key)) return true;
    seen.add(key);
    removed.push(title);
    return false;
  });

  const missing = wanted.filter((w) => !seen.has(norm(w)));

  await writeFile(SOUNDTRACKS_TS, head + kept.join('\n') + tail);

  console.log(`Removed ${removed.length} from ${listName}:`);
  for (const r of removed) console.log(`  - ${r}`);
  if (missing.length) {
    console.log(`\nNot found in ${listName} (check spelling, or it may be in another list):`);
    for (const m of missing) console.log(`  ? ${m}`);
  }
  console.log('\nNext: clear the collection pool so it rebuilds without them, then redeploy.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
