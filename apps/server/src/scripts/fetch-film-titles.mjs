// Pulls film titles from public Wikipedia list articles. IMDb has no free API and scraping it
// breaks their terms; these lists are the permissible equivalent and are broad enough that the
// limiting factor becomes Deezer's catalogue rather than the size of the candidate pool.
const PAGES = [
  'List of highest-grossing films',
  "AFI's 100 Years...100 Movies",
  "AFI's 100 Years...100 Songs",
  'List of films considered the best',
  'Academy Award for Best Picture',
  'Academy Award for Best Original Song',
  'Grammy Award for Best Compilation Soundtrack for Visual Media',
  'Academy Award for Best Original Score',
  'List of highest-grossing animated films',
  'List of highest-grossing musical films',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const titles = new Set();

for (const page of PAGES) {
  const url =
    'https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&page=' +
    encodeURIComponent(page);
  const res = await fetch(url, { headers: { 'User-Agent': 'Chorusify-curation/1.0' } });
  const body = await res.json();
  const text = body?.parse?.wikitext?.['*'];
  if (!text) { console.error('no wikitext for', page); continue; }

  // Film titles in these tables are wiki links, often piped or disambiguated:
  // [[Titanic (1997 film)|Titanic]] or [[The Godfather]].
  for (const m of text.matchAll(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g)) {
    const raw = (m[2] ?? m[1]).trim();
    const clean = raw
      .replace(/\s*\((?:19|20)\d{2}(?:\s+film)?\)\s*$/i, '')
      .replace(/\s*\(film\)\s*$/i, '')
      .replace(/\s*\(soundtrack\)\s*$/i, '')
      .trim();
    // Reject the non-film links these pages are full of: people, years, categories, refs.
    if (clean.length < 2 || clean.length > 48) continue;
    if (/^(File|Image|Category|Template|Wikipedia|Help|List of|Portal)[:\s]/i.test(clean)) continue;
    if (/^\d{4}$/.test(clean)) continue;
    if (/\b(Award|Academy|Grammy|Institute|Box Office|Billboard|Records?|Studios?|Pictures|Entertainment|Productions)\b/i.test(clean)) continue;
    titles.add(clean);
  }
  console.error(`${page}: running total ${titles.size}`);
  await sleep(250);
}

const out = [...titles].sort();
console.log(JSON.stringify(out, null, 0));
console.error(`\n${out.length} candidate titles`);
