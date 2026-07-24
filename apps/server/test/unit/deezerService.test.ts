import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getFreshPreviewUrl,
  clearPreviewCache,
  searchArtists,
  getArtistById,
  getArtistTopTracks,
  clearArtistCaches,
} from '../../src/services/deezerService';

beforeEach(() => {
  clearPreviewCache();
  clearArtistCaches();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getFreshPreviewUrl', () => {
  it('returns preview data from a successful lookup', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ preview: 'https://example.test/a.mp3', duration: 210 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getFreshPreviewUrl('123');
    expect(result).toEqual({ previewUrl: 'https://example.test/a.mp3', durationSeconds: 210 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when the HTTP request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await getFreshPreviewUrl('missing')).toBeNull();
  });

  it('returns null when Deezer reports an error for the track', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ error: { message: 'no data' } }),
        }),
    );
    expect(await getFreshPreviewUrl('bad-id')).toBeNull();
  });

  it('returns null when the track has no preview available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ duration: 100 }) }),
    );
    expect(await getFreshPreviewUrl('no-preview')).toBeNull();
  });

  it('caches a successful lookup and does not re-fetch on the next call', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ preview: 'https://example.test/b.mp3', duration: 180 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getFreshPreviewUrl('456');
    await getFreshPreviewUrl('456');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('searchArtists', () => {
  it('sorts results by fan count descending, filtering out malformed entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: 1, name: 'Low Profile Queen', nb_fan: 67, picture_medium: 'a.jpg' },
              { id: 2, name: 'The Real Queen', nb_fan: 5_000_000, picture_medium: 'b.jpg' },
              { name: 'Missing id' },
            ],
          }),
      }),
    );

    const results = await searchArtists('Queen');
    expect(results).toEqual([
      { id: 2, name: 'The Real Queen', pictureUrl: 'b.jpg' },
      { id: 1, name: 'Low Profile Queen', pictureUrl: 'a.jpg' },
    ]);
  });

  it('returns an empty list when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await searchArtists('anything')).toEqual([]);
  });
});

describe('getArtistById', () => {
  it('returns the artist and caches the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 412, name: 'Queen' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await getArtistById(412)).toEqual({ id: 412, name: 'Queen', pictureUrl: null });
    expect(await getArtistById(412)).toEqual({ id: 412, name: 'Queen', pictureUrl: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when Deezer reports an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ error: {} }) }),
    );
    expect(await getArtistById(999)).toBeNull();
  });
});

describe('getArtistTopTracks', () => {
  it('filters out tracks with no preview and maps fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 111,
                title: 'Has Preview',
                duration: 200,
                preview: 'https://example.test/x.mp3',
                artist: { name: 'Queen' },
                album: { cover_medium: 'art.jpg' },
              },
              { id: 222, title: 'No Preview', duration: 180, artist: { name: 'Queen' } },
            ],
          }),
      }),
    );

    const tracks = await getArtistTopTracks(412);
    expect(tracks).toEqual([
      {
        deezerTrackId: '111',
        title: 'Has Preview',
        artist: 'Queen',
        albumArtUrl: 'art.jpg',
        durationSeconds: 200,
      },
    ]);
  });

  it('excludes acoustic/live/remix/etc. versions regardless of includeFeatures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 1,
                title: 'Yellow',
                duration: 200,
                preview: 'a.mp3',
                artist: { name: 'Coldplay' },
              },
              {
                id: 2,
                title: 'Yellow (Acoustic)',
                duration: 200,
                preview: 'b.mp3',
                artist: { name: 'Coldplay' },
              },
              {
                id: 3,
                title: 'Yellow - Live at Wembley',
                duration: 200,
                preview: 'c.mp3',
                artist: { name: 'Coldplay' },
              },
              {
                id: 4,
                title: 'Yellow (Remix)',
                duration: 200,
                preview: 'd.mp3',
                artist: { name: 'Coldplay' },
              },
            ],
          }),
      }),
    );

    const tracks = await getArtistTopTracks(412, true);
    expect(tracks.map((t) => t.title)).toEqual(['Yellow']);
  });

  it('excludes tracks whose title credits a feature when includeFeatures is false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 1,
                title: 'The Scientist',
                duration: 200,
                preview: 'a.mp3',
                artist: { name: 'Coldplay' },
              },
              {
                id: 2,
                title: 'Ma Meilleure Ennemie ft. Coldplay',
                duration: 200,
                preview: 'b.mp3',
                artist: { name: 'Stromae' },
              },
            ],
          }),
      }),
    );

    const excluded = await getArtistTopTracks(412, false);
    expect(excluded.map((t) => t.title)).toEqual(['The Scientist']);

    const included = await getArtistTopTracks(412, true);
    expect(included.map((t) => t.title)).toEqual([
      'The Scientist',
      'Ma Meilleure Ennemie ft. Coldplay',
    ]);
  });

  it('caches separately per includeFeatures setting', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ data: [{ id: 1, title: 'Song', duration: 200, preview: 'a.mp3' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getArtistTopTracks(412, false);
    await getArtistTopTracks(412, false);
    await getArtistTopTracks(412, true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
