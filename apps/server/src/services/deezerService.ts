/**
 * Deezer's preview URLs are HMAC-signed with a short expiry (observed ~15 minutes from
 * issuance), so the `preview_url` stored on a `songs` row at curation time cannot be reused
 * for playback later — it must be re-fetched close to the moment a player actually needs it.
 * This wraps that live lookup with a short in-memory cache (comfortably under the token's
 * real TTL) so concurrent players loading the same daily puzzle don't each trigger their own
 * call to Deezer's public API.
 */
import { isUnwantedVersion, mentionsFeature } from '../utils/trackFilters';
import { logger } from '../logger';

interface FreshPreview {
  previewUrl: string;
  durationSeconds: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry<FreshPreview>>();

interface DeezerTrackResponse {
  preview?: string;
  duration?: number;
  error?: unknown;
}

export async function getFreshPreviewUrl(deezerTrackId: string): Promise<FreshPreview | null> {
  const cached = cache.get(deezerTrackId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const res = await fetch(`https://api.deezer.com/track/${encodeURIComponent(deezerTrackId)}`, {
    headers: { Referer: 'https://chorus.app/' },
  });
  if (!res.ok) return null;

  const body = (await res.json()) as DeezerTrackResponse;
  if (!body.preview || body.error) return null;

  const value: FreshPreview = { previewUrl: body.preview, durationSeconds: body.duration ?? 0 };
  cache.set(deezerTrackId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function clearPreviewCache(): void {
  cache.clear();
}

// --- Artist lookups (Artist Mode) -------------------------------------------------------

const ARTIST_CACHE_TTL_MS = 60 * 60 * 1000;

export interface ArtistSearchResult {
  id: number;
  name: string;
  pictureUrl: string | null;
}

interface DeezerArtistResponse {
  id?: number;
  name?: string;
  picture_medium?: string;
  nb_fan?: number;
  error?: unknown;
}

interface DeezerArtistSearchResponse {
  data: DeezerArtistResponse[];
}

export async function searchArtists(query: string): Promise<ArtistSearchResult[]> {
  const res = await fetch(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=5`,
    {
      headers: { Referer: 'https://chorus.app/' },
    },
  );
  if (!res.ok) return [];

  const body = (await res.json()) as DeezerArtistSearchResponse;
  return (body.data ?? [])
    .filter(
      (a): a is Required<Pick<DeezerArtistResponse, 'id' | 'name'>> & DeezerArtistResponse =>
        typeof a.id === 'number' && typeof a.name === 'string',
    )
    .sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0))
    .slice(0, 5)
    .map((a) => ({ id: a.id, name: a.name, pictureUrl: a.picture_medium ?? null }));
}

const artistCache = new Map<
  number,
  CacheEntry<{ id: number; name: string; pictureUrl: string | null } | null>
>();

export async function getArtistById(
  artistId: number,
): Promise<{ id: number; name: string; pictureUrl: string | null } | null> {
  const cached = artistCache.get(artistId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const res = await fetch(`https://api.deezer.com/artist/${artistId}`, {
    headers: { Referer: 'https://chorus.app/' },
  });

  let value: { id: number; name: string; pictureUrl: string | null } | null = null;
  if (res.ok) {
    const body = (await res.json()) as DeezerArtistResponse;
    value =
      body.id && body.name && !body.error
        ? { id: body.id, name: body.name, pictureUrl: body.picture_medium ?? null }
        : null;
  }

  artistCache.set(artistId, { value, expiresAt: Date.now() + ARTIST_CACHE_TTL_MS });
  return value;
}

export interface ArtistTrack {
  deezerTrackId: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  durationSeconds: number;
}

interface DeezerAlbum {
  id: number;
  title: string;
  nb_tracks: number;
  cover_medium?: string;
}

interface DeezerAlbumListResponse {
  data: DeezerAlbum[];
  next?: string;
}

interface DeezerAlbumTrack {
  id: number;
  title: string;
  duration: number;
  preview?: string;
  artist?: { name: string };
  album?: { cover_medium?: string };
}

interface DeezerAlbumTrackResponse {
  data: DeezerAlbumTrack[];
  next?: string;
}

async function fetchAllAlbums(artistId: number): Promise<DeezerAlbum[]> {
  const albums: DeezerAlbum[] = [];
  let url: string | null = `https://api.deezer.com/artist/${artistId}/albums?limit=100`;

  while (url) {
    const res = await fetch(url, { headers: { Referer: 'https://chorus.app/' } });
    if (!res.ok) break;
    const body = (await res.json()) as DeezerAlbumListResponse;
    albums.push(...(body.data ?? []));
    url = body.next ?? null;
  }

  return albums;
}

async function fetchAlbumTracks(albumId: number): Promise<DeezerAlbumTrack[]> {
  const tracks: DeezerAlbumTrack[] = [];
  let url: string | null = `https://api.deezer.com/album/${albumId}/tracks?limit=100`;

  while (url) {
    const res = await fetch(url, { headers: { Referer: 'https://chorus.app/' } });
    if (!res.ok) break;
    const body = (await res.json()) as DeezerAlbumTrackResponse;
    tracks.push(...(body.data ?? []));
    url = body.next ?? null;
  }

  return tracks;
}

const topTracksCache = new Map<string, CacheEntry<ArtistTrack[]>>();

/**
 * Fetches an artist's full discography (all albums → all tracks), filtering out
 * karaoke/tribute/acoustic/live/remix/etc. versions. `includeFeatures` controls whether
 * tracks whose title credits another artist as a feature are kept.
 *
 * Results are cached for one hour. For popular artists with many albums this may take a
 * moment on the first call, but subsequent loads within the hour reuse the cached pool.
 */
export async function getArtistTopTracks(
  artistId: number,
  includeFeatures = false,
): Promise<ArtistTrack[]> {
  const cacheKey = `${artistId}:${includeFeatures}`;
  const cached = topTracksCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  logger.info(`Fetching full discography for artist ${artistId}...`);

  const albums = await fetchAllAlbums(artistId);
  logger.info(`Found ${albums.length} albums for artist ${artistId}`);

  // Build a lookup from album id → cover art so tracks can inherit their parent album's art.
  const albumCovers = new Map<number, string | null>();
  for (const a of albums) {
    albumCovers.set(a.id, a.cover_medium ?? null);
  }

  // Fetch tracks from each album concurrently (capped to avoid flooding Deezer).
  const CONCURRENCY = 5;
  const allRawTracks: (DeezerAlbumTrack & { albumId?: number })[] = [];

  for (let i = 0; i < albums.length; i += CONCURRENCY) {
    const batch = albums.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (a) => {
        const tracks = await fetchAlbumTracks(a.id);
        return tracks.map((t) => ({ ...t, albumId: a.id }));
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        allRawTracks.push(...r.value);
      }
    }
  }

  // Filter and deduplicate by normalized title since the same track can appear on
  // multiple albums (singles, compilations, deluxe editions, etc.).
  const seen = new Set<string>();
  const tracks: ArtistTrack[] = [];

  for (const t of allRawTracks) {
    if (!t.preview) continue;
    if (isUnwantedVersion(t.title)) continue;
    if (!includeFeatures && mentionsFeature(t.title)) continue;

    const normalizedTitle = t.title.toLowerCase().trim();
    if (seen.has(normalizedTitle)) continue;
    seen.add(normalizedTitle);

    tracks.push({
      deezerTrackId: String(t.id),
      title: t.title,
      artist: t.artist?.name ?? 'Unknown',
      albumArtUrl:
        t.album?.cover_medium ?? (t.albumId != null ? (albumCovers.get(t.albumId) ?? null) : null),
      durationSeconds: t.duration,
    });
  }

  logger.info(
    `Discography for artist ${artistId}: ${allRawTracks.length} raw → ${tracks.length} after filtering`,
  );

  topTracksCache.set(cacheKey, { value: tracks, expiresAt: Date.now() + ARTIST_CACHE_TTL_MS });
  return tracks;
}

export function clearArtistCaches(): void {
  artistCache.clear();
  topTracksCache.clear();
}
