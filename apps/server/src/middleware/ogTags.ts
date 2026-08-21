/**
 * Per-route social preview tags for the single-page app.
 *
 * Crawlers do not run JavaScript, so anything React sets in `document.head` is invisible to
 * them: every shared link — a challenge someone spent ten rounds on, a survival streak — used
 * to preview as the same generic site card. The tags have to be in the HTML as served, which
 * means rewriting `index.html` on the way out.
 *
 * Kept deliberately cheap because it runs on every page load: the file is read once and cached,
 * category labels are already in memory, and only the artist route touches the database — via
 * the pool cache, never Deezer.
 */
import fs from 'fs';
import type { Request } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { artistTrackPools } from '../db/schema';
import { findCategory } from '../services/categories';
import { logger } from '../logger';

interface Preview {
  title: string;
  description: string;
}

const DEFAULT_PREVIEW: Preview = {
  title: 'Chorusify: snippet type',
  description: 'Hear a growing snippet of a song and guess it in as few listens as possible.',
};

/**
 * Escapes a value for an HTML attribute.
 *
 * Load-bearing, not defensive habit: artist names legitimately contain quotes and ampersands
 * ("Guns N' Roses", "Simon & Garfunkel"), and one unescaped double quote would break out of the
 * `content="…"` attribute and mangle the whole tag.
 */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Artist names by Deezer id, from the pool cache. Small and slow-changing, so a plain map. */
const artistNameCache = new Map<string, { name: string | null; expiresAt: number }>();
const ARTIST_NAME_TTL_MS = 60 * 60 * 1000;

async function artistNameFor(deezerArtistId: string): Promise<string | null> {
  const cached = artistNameCache.get(deezerArtistId);
  if (cached && cached.expiresAt > Date.now()) return cached.name;

  try {
    const rows = await db
      .select({ artistName: artistTrackPools.artistName })
      .from(artistTrackPools)
      .where(
        and(
          eq(artistTrackPools.deezerArtistId, deezerArtistId),
          eq(artistTrackPools.includeFeatures, false),
        ),
      )
      .limit(1);

    const name = rows[0]?.artistName ?? null;
    artistNameCache.set(deezerArtistId, { name, expiresAt: Date.now() + ARTIST_NAME_TTL_MS });
    return name;
  } catch (err) {
    // A preview is cosmetic; never let it be the reason a page fails to serve.
    logger.warn({ err, deezerArtistId }, 'Could not resolve artist name for social preview');
    return null;
  }
}

/** The preview for a path, or the site default when the route isn't especially shareable. */
export async function previewFor(pathname: string): Promise<Preview> {
  const artistMatch = /^\/artist\/(\d+)\/play\/?$/.exec(pathname);
  if (artistMatch) {
    const name = await artistNameFor(artistMatch[1]!);
    if (!name) return { ...DEFAULT_PREVIEW, title: 'Artist Mode on Chorusify' };
    return {
      title: `Can you name 10 ${name} songs? | Chorusify`,
      description: `Guess ${name} tracks from a growing snippet. How many can you get?`,
    };
  }

  const categoryMatch = /^\/category\/([^/]+)\/play\/?$/.exec(pathname);
  if (categoryMatch) {
    const category = findCategory(decodeURIComponent(categoryMatch[1]!));
    if (category) {
      return {
        title: `${category.label} on Chorusify`,
        description: `${category.blurb}. Ten songs, one growing snippet each.`,
      };
    }
  }

  if (/^\/survival\/?$/.test(pathname)) {
    return {
      title: 'Survival on Chorusify',
      description: 'Endless songs, one wrong answer ends the run. How long can you last?',
    };
  }

  if (/^\/play\/?$/.test(pathname)) {
    return {
      title: "Today's challenge on Chorusify",
      description: 'One song, six growing snippets. A new puzzle every day.',
    };
  }

  return DEFAULT_PREVIEW;
}

let cachedIndex: string | null = null;

function readIndex(indexPath: string): string {
  if (cachedIndex == null) cachedIndex = fs.readFileSync(indexPath, 'utf8');
  return cachedIndex;
}

/** Test seam — drops the cached HTML so a rewritten fixture is picked up. */
export function clearIndexCache(): void {
  cachedIndex = null;
}

function replaceMeta(html: string, attr: 'property' | 'name', key: string, value: string): string {
  const pattern = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, 'i');
  return html.replace(pattern, `$1${escapeAttribute(value)}$2`);
}

/**
 * `index.html` with the social tags rewritten for this request.
 *
 * `og:image` is made absolute here rather than in the source file because the origin is only
 * known per request, and relative image URLs are ignored by every major crawler.
 */
export async function renderIndexWithPreview(indexPath: string, req: Request): Promise<string> {
  const preview = await previewFor(req.path);

  // `x-forwarded-proto` is honoured because the app sits behind Caddy in production; getting
  // this wrong yields an http:// image URL on an https:// page, which crawlers drop.
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol;
  const origin = `${proto}://${req.get('host') ?? ''}`;
  const imageUrl = `${origin}/og-card.png`;
  const pageUrl = `${origin}${req.originalUrl}`;

  let html = readIndex(indexPath);
  html = replaceMeta(html, 'property', 'og:title', preview.title);
  html = replaceMeta(html, 'property', 'og:description', preview.description);
  html = replaceMeta(html, 'property', 'og:image', imageUrl);
  html = replaceMeta(html, 'property', 'og:url', pageUrl);
  html = replaceMeta(html, 'name', 'twitter:title', preview.title);
  html = replaceMeta(html, 'name', 'twitter:description', preview.description);
  html = replaceMeta(html, 'name', 'twitter:image', imageUrl);
  html = replaceMeta(html, 'name', 'description', preview.description);
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttribute(preview.title)}</title>`);

  return html;
}
