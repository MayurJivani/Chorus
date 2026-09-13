/**
 * Screens a list of film/game/anime titles into verified Deezer album ids.
 *
 *   npx tsx apps/server/src/scripts/curate-titles.ts candidates.json accepted.json
 *
 * `candidates.json` is `[{ "movie": "Jab We Met", "query": "optional search override" }]`.
 * `accepted.json` comes out in the shape `movies.ts` wants, ready to paste in.
 *
 * Why a screen rather than hand-approval. Every id in the catalogue was originally approved by
 * reading its track listing, because searching Deezer for a title is nowhere near good enough.
 * That does not scale past a couple of hundred, so the rules those approvals taught are encoded
 * here. Each REJECT term below comes from a real near-miss, most of which look perfectly
 * plausible from the album title alone:
 *
 *   - piano/score-only re-recordings ("La La Land Soundtrack for Piano") — no vocal to recognise
 *   - cover bands trading on the name ("Dirty Dancing" by "Film Musical Orchestra", Forrest
 *     Gump by "The Popcorn Buckets")
 *   - cast recordings, which are different performers to the film
 *   - sing-along, commentary and karaoke editions
 *   - German and Japanese dubs, and "Hörspiel" audio dramas, which rank highly because this
 *     deployment's Deezer calls resolve from a German IP
 *   - fan and unofficial releases ("Fallout 76 Unofficial Soundtrack", "Rocket League
 *     (Soundtrack Inspired)")
 *
 * The screen is not a substitute for looking. Audit a spread of the output before merging — the
 * first run of this caught 151 of 223 games, and eyeballing eleven of them found one wrong,
 * which is a 9% error rate and not shippable. Tightening the list and re-screening caught four
 * more. Sample the middle and the tail, not the head; the head is the easy cases.
 */
import { readFile, writeFile } from 'node:fs/promises';

const REJECT = [
  'piano',
  'karaoke',
  'tribute',
  'lofi',
  'lo-fi',
  'covers',
  'cover version',
  'performed by',
  'in the style',
  'music box',
  'lullaby',
  'relaxing',
  'meditation',
  'string quartet',
  'guitar',
  'best of',
  'greatest hits',
  'themes from',
  'tribute to',
  'inspired',
  'medley',
  'remix',
  'workout',
  'study',
  'sleep',
  '8 bit',
  '8-bit',
  'chiptune',
  'cast recording',
  'sing-a-long',
  'sing along',
  'singalong',
  'commentary',
  'hoerspiel',
  'hörspiel',
  'outtakes',
  'in concert',
  'highlights',
  'many more',
  'orchestra plays',
  'made famous',
  'session singers',
  'background orchestra',
  'unofficial',
  'fanmade',
  'arrange',
  'vocal collection',
  'sampler',
  'trailer music',
  'music from the world of',
  'instrumental version',
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * The album must *start* with the title. Prefix collisions are the subtlest failure here:
 * searching "Jawan" returns "Jawani On The Rocks", "Frozen" returns "Frozen Planet II", and a
 * digit straight after the title means a different instalment ("Moana" -> "Moana 2").
 */
function titleOk(albumTitle: string, wanted: string): boolean {
  const a = norm(albumTitle);
  const m = norm(wanted);
  if (!a.startsWith(m)) return false;
  const rest = a.slice(m.length);
  // Must break on a word boundary. Checking only for a trailing digit let "Jawan" match
  // "Jawani", which is the collision this rule exists to stop — normalised text is [a-z0-9 ],
  // so a real boundary means the remainder is empty or starts with a space.
  if (rest !== '' && !rest.startsWith(' ')) return false;
  // A number straight after the title is a different instalment: "Moana" -> "Moana 2".
  return !/^\d/.test(rest.trim());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  for (let i = 0; i < 8; i++) {
    const body = (await (await fetch(url)).json()) as Record<string, unknown>;
    const error = body.error as { type?: string } | undefined;
    if (error?.type === 'QuotaException') {
      await sleep(2500);
      continue;
    }
    return body;
  }
  return null;
}

interface Candidate {
  movie: string;
  query?: string;
}

async function main() {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) throw new Error('usage: curate-titles.ts <candidates.json> <out.json>');

  const candidates = JSON.parse(await readFile(inPath, 'utf8')) as Candidate[];
  const accepted: { movie: string; albumId: string }[] = [];

  for (const { movie, query } of candidates) {
    const search = await fetchJson(
      `https://api.deezer.com/search/album?q=${encodeURIComponent(query ?? movie)}&limit=12`,
    );
    const data = (search?.data ?? []) as { id: number; title: string; nb_tracks: number }[];
    const viable = data.filter((c) => {
      if (c.nb_tracks < 6) return false;
      const t = c.title.toLowerCase();
      if (REJECT.some((r) => t.includes(r))) return false;
      return titleOk(c.title, movie);
    });
    if (!viable.length) {
      console.log(`MISS\t${movie}`);
      continue;
    }

    const best = viable.sort((a, b) => b.nb_tracks - a.nb_tracks)[0]!;
    const tracks = await fetchJson(`https://api.deezer.com/album/${best.id}/tracks?limit=50`);
    const rows = (tracks?.data ?? []) as { preview?: string | null; artist?: { name?: string } }[];
    const playable = rows.filter((t) => t.preview).length;
    // Under this the album is effectively absent from the collection it joins.
    if (playable < 6) {
      console.log(`LOW \t${movie}\t${playable}/${rows.length}`);
      continue;
    }

    accepted.push({ movie, albumId: String(best.id) });
    console.log(
      `OK  \t${movie}\t${best.id}\t${playable}/${rows.length}\t${best.title.slice(0, 44)}\t[${rows[0]?.artist?.name}]`,
    );
    await sleep(110);
  }

  await writeFile(outPath, JSON.stringify(accepted, null, 2));
  console.log(`\naccepted ${accepted.length} of ${candidates.length} -> ${outPath}`);
  console.log('Audit a spread of these before merging. The head of the list is the easy cases.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
