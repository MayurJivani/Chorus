import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Request } from 'express';
import { db } from '../../src/db/client';
import { artistTrackPools } from '../../src/db/schema';
import { clearIndexCache, previewFor, renderIndexWithPreview } from '../../src/middleware/ogTags';

/** A minimal index.html shaped like the real one, including its wrapped attributes. */
const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta name="description"
    content="Chorus - guess the song from a growing snippet." />
  <meta property="og:title" content="Chorus - daily music guessing game" />
  <meta property="og:description"
    content="Hear a growing snippet of a song and guess it." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="/" />
  <meta property="og:image" content="/og-card.png" />
  <meta property="og:image:width" content="1200" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="/og-card.png" />
  <meta name="twitter:title" content="Chorus - daily music guessing game" />
  <meta name="twitter:description"
    content="Hear a growing snippet of a song and guess it." />
  <title>Chorus - daily music guessing game</title>
</head>
<body><div id="root"></div></body>
</html>`;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chorus-og-'));
const indexPath = path.join(tmpDir, 'index.html');
fs.writeFileSync(indexPath, INDEX_HTML);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function fakeRequest(url: string, host = 'chorus.test'): Request {
  const [pathname] = url.split('?');
  return {
    path: pathname,
    originalUrl: url,
    protocol: 'http',
    headers: { 'x-forwarded-proto': 'https' },
    get: (name: string) => (name.toLowerCase() === 'host' ? host : undefined),
  } as unknown as Request;
}

beforeEach(async () => {
  await db.delete(artistTrackPools);
  clearIndexCache();
});

describe('previewFor', () => {
  it('names the artist when their pool is cached', async () => {
    await db.insert(artistTrackPools).values({
      deezerArtistId: '412',
      includeFeatures: false,
      artistName: 'Queen',
      tracks: [],
      trackCount: 0,
    });

    const preview = await previewFor('/artist/412/play');
    expect(preview.title).toBe('Can you name 10 Queen songs? — Chorus');
    expect(preview.description).toContain('Queen');
  });

  it('falls back gracefully for an artist nobody has played yet', async () => {
    const preview = await previewFor('/artist/999/play');
    expect(preview.title).toBe('Artist Mode — Chorus');
  });

  it('uses the category label and blurb', async () => {
    const preview = await previewFor('/category/year-2020/play');
    expect(preview.title).toBe('Top Hits 2020 — Chorus');
    expect(preview.description).toContain('2020');
  });

  it('ignores an unknown category rather than inventing a title', async () => {
    const preview = await previewFor('/category/year-1066/play');
    expect(preview.title).toBe('Chorus — daily music guessing game');
  });

  it('describes Survival and the daily challenge', async () => {
    expect((await previewFor('/survival')).title).toBe('Survival — Chorus');
    expect((await previewFor('/play')).title).toBe("Today's challenge — Chorus");
  });

  it('falls back to the site card for everything else', async () => {
    for (const route of ['/', '/leaderboard', '/admin', '/nonsense']) {
      expect((await previewFor(route)).title).toBe('Chorus — daily music guessing game');
    }
  });
});

describe('renderIndexWithPreview', () => {
  it('rewrites the title and both tag families', async () => {
    await db.insert(artistTrackPools).values({
      deezerArtistId: '412',
      includeFeatures: false,
      artistName: 'Queen',
      tracks: [],
      trackCount: 0,
    });

    const html = await renderIndexWithPreview(indexPath, fakeRequest('/artist/412/play'));

    expect(html).toContain('<title>Can you name 10 Queen songs? — Chorus</title>');
    expect(html).toContain('property="og:title" content="Can you name 10 Queen songs? — Chorus"');
    expect(html).toContain('name="twitter:title" content="Can you name 10 Queen songs? — Chorus"');
    // The wrapped, multi-line description attributes must be rewritten too.
    expect(html).toContain(
      'content="Guess Queen tracks from a growing snippet. How many can you get?"',
    );
    expect(html).not.toContain('Hear a growing snippet of a song and guess it.');
  });

  it('makes the image absolute, honouring the proxy protocol', async () => {
    const html = await renderIndexWithPreview(indexPath, fakeRequest('/survival'));

    // https, not the http the app itself sees behind Caddy — crawlers drop a mixed-scheme image.
    expect(html).toContain('property="og:image" content="https://chorus.test/og-card.png"');
    expect(html).toContain('name="twitter:image" content="https://chorus.test/og-card.png"');
    expect(html).toContain('property="og:url" content="https://chorus.test/survival"');
  });

  it('preserves the query string in og:url so a shared challenge link round-trips', async () => {
    const html = await renderIndexWithPreview(
      indexPath,
      fakeRequest('/category/year-2020/play?challengeId=7&guessMode=choice'),
    );
    expect(html).toContain(
      'content="https://chorus.test/category/year-2020/play?challengeId=7&amp;guessMode=choice"',
    );
  });

  it('escapes quotes and ampersands in an artist name', async () => {
    // "Guns N' Roses" and "Simon & Garfunkel" are real; one raw quote would break the attribute.
    await db.insert(artistTrackPools).values({
      deezerArtistId: '77',
      includeFeatures: false,
      artistName: 'Simon & Garfunkel "Live"',
      tracks: [],
      trackCount: 0,
    });

    const html = await renderIndexWithPreview(indexPath, fakeRequest('/artist/77/play'));

    expect(html).toContain('Simon &amp; Garfunkel &quot;Live&quot;');
    // The tag must still be well formed: no stray quote ended the attribute early.
    expect(html).toMatch(/property="og:title" content="[^"]*"\s*\/>/);
  });

  it('leaves the document intact for an ordinary route', async () => {
    const html = await renderIndexWithPreview(indexPath, fakeRequest('/'));
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<title>Chorus — daily music guessing game</title>');
  });
});
