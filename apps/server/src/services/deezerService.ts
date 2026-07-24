/**
 * Deezer's preview URLs are HMAC-signed with a short expiry (observed ~15 minutes from
 * issuance), so the `preview_url` stored on a `songs` row at curation time cannot be reused
 * for playback later — it must be re-fetched close to the moment a player actually needs it.
 * This wraps that live lookup with a short in-memory cache (comfortably under the token's
 * real TTL) so concurrent players loading the same daily puzzle don't each trigger their own
 * call to Deezer's public API.
 */
import { isUnwantedVersion, mentionsFeature } from '../utils/trackFilters';

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
// The track *list* for an artist doesn't expire the way preview URLs do, so this cache uses
// a much longer TTL — it just saves repeat calls to Deezer while a challenge is being built
// or re-viewed, not a workaround for a short-lived signed URL.

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
  return (
    (body.data ?? [])
      .filter(
        (a): a is Required<Pick<DeezerArtistResponse, 'id' | 'name'>> & DeezerArtistResponse =>
          typeof a.id === 'number' && typeof a.name === 'string',
      )
      // Deezer's default search order doesn't reliably surface the best-known artist first
      // (duplicate/low-profile entries can outrank the famous one) — sort by fan count instead.
      .sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0))
      .slice(0, 5)
      .map((a) => ({ id: a.id, name: a.name, pictureUrl: a.picture_medium ?? null }))
  );
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

interface DeezerArtistTrack {
  id: number;
  title: string;
  duration: number;
  preview?: string;
  artist?: { name: string };
  album?: { cover_medium?: string };
}

interface DeezerArtistTopTracksResponse {
  data: DeezerArtistTrack[];
}

const topTracksCache = new Map<string, CacheEntry<ArtistTrack[]>>();

/**
 * Fetches an artist's top tracks, always excluding karaoke/tribute/acoustic/live/remix/etc.
 * versions (never a good pick for a guessing game). `includeFeatures` controls whether tracks
 * whose title credits another artist as a feature (e.g. "... ft. Coldplay") are kept — those
 * often mean the searched artist isn't really the track's primary artist. Defaults to
 * excluding them, which is the more focused/expected experience for "play this artist."
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

  const res = await fetch(`https://api.deezer.com/artist/${artistId}/top?limit=50`, {
    headers: { Referer: 'https://chorus.app/' },
  });
  if (!res.ok) return [];

  const body = (await res.json()) as DeezerArtistTopTracksResponse;
  const tracks: ArtistTrack[] = (body.data ?? [])
    .filter((t) => Boolean(t.preview))
    .filter((t) => !isUnwantedVersion(t.title))
    .filter((t) => includeFeatures || !mentionsFeature(t.title))
    .map((t) => ({
      deezerTrackId: String(t.id),
      title: t.title,
      artist: t.artist?.name ?? 'Unknown',
      albumArtUrl: t.album?.cover_medium ?? null,
      durationSeconds: t.duration,
    }));

  topTracksCache.set(cacheKey, { value: tracks, expiresAt: Date.now() + ARTIST_CACHE_TTL_MS });
  return tracks;
}

export function clearArtistCaches(): void {
  artistCache.clear();
  topTracksCache.clear();
}
