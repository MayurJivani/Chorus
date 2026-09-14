// Pulls candidate titles from public Wikipedia list articles, per collection.
//
//   node apps/server/src/scripts/fetch-film-titles.mjs <bollywood|anime|games|scores|hollywood>
//
// IMDb has no free API and scraping it breaks their terms; these list articles are the
// permissible equivalent, and between them they move the limiting factor from "how many titles
// can I think of" to "how many does Deezer actually carry".
//
// Output is a bare JSON array of titles on stdout; progress goes to stderr.
const SOURCES = {
  hollywood: [
    'List of highest-grossing films',
    "AFI's 100 Years...100 Movies",
    "AFI's 100 Years...100 Songs",
    'List of films considered the best',
    'Academy Award for Best Picture',
    'Academy Award for Best Original Song',
    'Grammy Award for Best Compilation Soundtrack for Visual Media',
    'List of highest-grossing animated films',
    'List of highest-grossing musical films',
  ],
  scores: [
    'Academy Award for Best Original Score',
    'Grammy Award for Best Score Soundtrack for Visual Media',
    'BAFTA Award for Best Film Music',
    'Golden Globe Award for Best Original Score',
    'List of film score composers',
  ],
  bollywood: [
    'List of highest-grossing Indian films',
    'List of highest-grossing Hindi films',
    'Filmfare Award for Best Film',
    'Filmfare Award for Best Music Album',
    'National Film Award for Best Feature Film in Hindi',
    'List of Bollywood films of 2019',
    'List of Bollywood films of 2020',
    'List of Bollywood films of 2021',
    'List of Bollywood films of 2022',
    'List of Bollywood films of 2023',
    'List of Bollywood films of 2024',
    'List of Bollywood films of 2018',
    'List of Bollywood films of 2017',
    'List of Bollywood films of 2016',
    'List of Bollywood films of 2015',
    'List of Bollywood films of 2014',
    'List of Bollywood films of 2013',
    'List of Bollywood films of 2012',
    'List of Bollywood films of 2011',
    'List of Bollywood films of 2010',
  ],
  anime: [
    'List of highest-grossing anime films',
    'List of Studio Ghibli works',
    'List of anime series by episode count',
    'Crunchyroll Anime Awards',
    'List of Madhouse works',
    'List of Bones works',
    'List of Kyoto Animation works',
    'List of ufotable works',
    'List of Production I.G works',
    'List of MAPPA works',
    'List of Toei Animation works',
    'List of Sunrise works',
  ],
  games: [
    'List of best-selling video games',
    'List of Game of the Year awards',
    'The Game Award for Best Score and Music',
    'BAFTA Games Award for Best Music',
    'List of video games considered the best',
    'Game Developers Choice Award for Best Audio',
  ],
};

const which = process.argv[2];
const pages = SOURCES[which];
if (!pages) {
  console.error(`usage: fetch-film-titles.mjs <${Object.keys(SOURCES).join('|')}>`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const titles = new Set();

for (const page of pages) {
  const url =
    'https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&page=' +
    encodeURIComponent(page);
  /*
   * Wikipedia rate-limits hard and answers with a plain-text notice rather than JSON, which
   * parses as a throw. Swallowing that silently reported every page as "missing" and produced
   * an empty run that looked like the article names were wrong — so back off and retry, and
   * only call a page missing once the response really was JSON without wikitext.
   */
  let text;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Chorusify-curation/1.0' } });
    const raw = await res.text();
    if (!raw.startsWith('{')) {
      const wait = 5000 * (attempt + 1);
      console.error(`  (rate-limited on "${page}", waiting ${wait / 1000}s)`);
      await sleep(wait);
      continue;
    }
    text = JSON.parse(raw)?.parse?.wikitext?.['*'];
    break;
  }
  if (!text) {
    console.error(`  (no wikitext for "${page}" — skipped)`);
    continue;
  }

  // Titles are wiki links, often piped or disambiguated:
  // [[Titanic (1997 film)|Titanic]], [[The Godfather]], [[''Akira'' (1988 film)|Akira]].
  for (const m of text.matchAll(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g)) {
    const clean = (m[2] ?? m[1])
      .trim()
      // Wikitext bold/italic markers, which otherwise reach the catalogue as ''Grease''.
      .replace(/'{2,}/g, '')
      .replace(/\s*\((?:19|20)\d{2}(?:\s+(?:film|video game|anime|TV series))?\)\s*$/i, '')
      .replace(/\s*\((?:film|video game|anime|TV series|soundtrack|album)\)\s*$/i, '')
      .trim();
    if (clean.length < 2 || clean.length > 48) continue;
    if (/^(File|Image|Category|Template|Wikipedia|Help|List of|Portal)[:\s]/i.test(clean)) continue;
    if (/^\d{4}$/.test(clean)) continue;
    // These pages are thick with links to people, studios and awards rather than works.
    if (
      /\b(Award|Academy|Grammy|BAFTA|Institute|Box Office|Billboard|Records?|Studios?|Pictures|Entertainment|Productions|Animation|Nintendo|Sony|Microsoft|Ubisoft|Publisher|Developer)\b/i.test(
        clean,
      )
    )
      continue;
    titles.add(clean);
  }
  console.error(`  ${page}: running total ${titles.size}`);
  // Polite spacing; the limiter is strict and a run is not urgent.
  await sleep(1200);
}

const out = [...titles].sort();
console.log(JSON.stringify(out));
console.error(`\n${out.length} candidate titles for ${which}`);
