import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getFreshPreviewUrl,
  clearPreviewCache,
  searchArtists,
  getArtistById,
  getArtistTopTracks,
  clearArtistCaches,
  __resetDeezerRateLimit,
} from '../../src/services/deezerService';

beforeEach(() => {
  clearPreviewCache();
  clearArtistCaches();
  __resetDeezerRateLimit();
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
      vi.fn().mockResolvedValue({
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
  function mockAlbumsAndTracks(
    albums: { id: number; title: string; cover_medium?: string }[],
    tracksByAlbum: Record<
      number,
      { id: number; title: string; duration: number; preview?: string; artist?: { name: string } }[]
    >,
  ) {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/albums?')) {
        return { ok: true, json: async () => ({ data: albums }) };
      }
      const match = url.match(/\/album\/(\d+)\/tracks/);
      if (match) {
        const albumId = Number(match[1]);
        return { ok: true, json: async () => ({ data: tracksByAlbum[albumId] ?? [] }) };
      }
      return { ok: false };
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('collapses label-invented variants onto the plain recording (ZAYN "EYES CLOSED")', async () => {
    // "BARE" and "UNVEILED" are not version keywords anywhere — the only thing marking them as
    // alternates is that a plain "EYES CLOSED" exists in the same catalog.
    mockAlbumsAndTracks([{ id: 1, title: 'Album' }], {
      1: [
        {
          id: 1,
          title: 'EYES CLOSED (BARE)',
          duration: 200,
          preview: 'a.mp3',
          artist: { name: 'ZAYN' },
        },
        { id: 2, title: 'EYES CLOSED', duration: 200, preview: 'b.mp3', artist: { name: 'ZAYN' } },
        {
          id: 3,
          title: 'EYES CLOSED (UNVEILED)',
          duration: 200,
          preview: 'c.mp3',
          artist: { name: 'ZAYN' },
        },
        {
          id: 4,
          title: 'EYES CLOSED (2.0)',
          duration: 200,
          preview: 'd.mp3',
          artist: { name: 'ZAYN' },
        },
      ],
    });

    const tracks = await getArtistTopTracks(9761322);

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ deezerTrackId: '2', title: 'EYES CLOSED' });
  });

  it('keeps a parenthetical title when no plain recording of it exists', async () => {
    mockAlbumsAndTracks([{ id: 1, title: 'Album' }], {
      1: [
        {
          id: 10,
          title: 'Single Ladies (Put a Ring on It)',
          duration: 200,
          preview: 'a.mp3',
          artist: { name: 'Beyonce' },
        },
        { id: 11, title: 'Halo', duration: 200, preview: 'b.mp3', artist: { name: 'Beyonce' } },
      ],
    });

    const titles = (await getArtistTopTracks(1)).map((t) => t.title).sort();
    expect(titles).toEqual(['Halo', 'Single Ladies (Put a Ring on It)']);
  });

  it('carries album cover_medium into track results', async () => {
    mockAlbumsAndTracks([{ id: 1, title: 'Album A', cover_medium: 'album-a.jpg' }], {
      1: [
        { id: 111, title: 'Track One', duration: 200, preview: 'a.mp3', artist: { name: 'Queen' } },
      ],
    });

    const tracks = await getArtistTopTracks(412);
    expect(tracks).toEqual([
      {
        deezerTrackId: '111',
        title: 'Track One',
        artist: 'Queen',
        albumArtUrl: 'album-a.jpg',
        durationSeconds: 200,
      },
    ]);
  });

  it('filters out tracks with no preview and maps fields', async () => {
    mockAlbumsAndTracks([{ id: 1, title: 'Album A', cover_medium: 'art.jpg' }], {
      1: [
        {
          id: 111,
          title: 'Has Preview',
          duration: 200,
          preview: 'https://example.test/x.mp3',
          artist: { name: 'Queen' },
        },
        { id: 222, title: 'No Preview', duration: 180, artist: { name: 'Queen' } },
      ],
    });

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
    mockAlbumsAndTracks([{ id: 1, title: 'Album A', cover_medium: undefined }], {
      1: [
        { id: 1, title: 'Yellow', duration: 200, preview: 'a.mp3', artist: { name: 'Coldplay' } },
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
    });

    const tracks = await getArtistTopTracks(412, true);
    expect(tracks.map((t) => t.title)).toEqual(['Yellow']);
  });

  it('keeps only the main version of a song, dropping alt versions like 2x Speed', async () => {
    mockAlbumsAndTracks([{ id: 1, title: 'Album A', cover_medium: undefined }], {
      1: [
        {
          id: 1,
          title: 'Eyes Closed',
          duration: 200,
          preview: 'a.mp3',
          artist: { name: 'Zayn' },
        },
        {
          id: 2,
          title: 'Eyes Closed (2x Speed)',
          duration: 200,
          preview: 'b.mp3',
          artist: { name: 'Zayn' },
        },
        {
          id: 3,
          title: 'Eyes Closed (0.5x)',
          duration: 200,
          preview: 'c.mp3',
          artist: { name: 'Zayn' },
        },
        {
          id: 4,
          title: 'Pillowtalk',
          duration: 200,
          preview: 'd.mp3',
          artist: { name: 'Zayn' },
        },
        {
          id: 5,
          title: 'Pillowtalk (Living Room Session)',
          duration: 200,
          preview: 'e.mp3',
          artist: { name: 'Zayn' },
        },
      ],
    });

    const tracks = await getArtistTopTracks(412);
    expect(tracks.map((t) => t.title)).toEqual(['Eyes Closed', 'Pillowtalk']);
  });

  it('keeps a versioned-only song rather than dropping it entirely', async () => {
    mockAlbumsAndTracks([{ id: 1, title: 'Album A', cover_medium: undefined }], {
      1: [
        {
          id: 1,
          title: 'Dream (Album Version)',
          duration: 200,
          preview: 'a.mp3',
          artist: { name: 'Artist' },
        },
      ],
    });

    const tracks = await getArtistTopTracks(412);
    expect(tracks.map((t) => t.title)).toEqual(['Dream (Album Version)']);
  });

  it('excludes tracks whose title credits a feature when includeFeatures is false', async () => {
    mockAlbumsAndTracks([{ id: 1, title: 'Album A', cover_medium: undefined }], {
      1: [
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
    });

    const excluded = await getArtistTopTracks(412, false);
    expect(excluded.map((t) => t.title)).toEqual(['The Scientist']);

    clearArtistCaches();
    mockAlbumsAndTracks([{ id: 1, title: 'Album A', cover_medium: undefined }], {
      1: [
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
    });

    const included = await getArtistTopTracks(412, true);
    expect(included.map((t) => t.title)).toEqual([
      'The Scientist',
      'Ma Meilleure Ennemie ft. Coldplay',
    ]);
  });

  it('caches separately per includeFeatures setting', async () => {
    const fetchMock = mockAlbumsAndTracks([{ id: 1, title: 'Album A', cover_medium: undefined }], {
      1: [{ id: 1, title: 'Song', duration: 200, preview: 'a.mp3' }],
    });

    await getArtistTopTracks(412, false);
    await getArtistTopTracks(412, false);
    await getArtistTopTracks(412, true);

    // Albums fetch: 1 for false (cached on second call), 1 for true = 2 album calls
    // Tracks fetch: 1 for false, 1 for true = 2 track calls
    // Total: 4 fetch calls
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('Deezer quota handling', () => {
  it('retries a quota error instead of reporting the track as unavailable', async () => {
    // Deezer signals throttling with HTTP 200 and an error body, which is otherwise
    // indistinguishable from a track that genuinely has no preview.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: { type: 'Exception', message: 'Quota limit exceeded' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ preview: 'https://example.test/p.mp3', duration: 30 }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getFreshPreviewUrl('123');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ previewUrl: 'https://example.test/p.mp3', durationSeconds: 30 });
  });

  it('gives up and returns null when the quota error never clears', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: { type: 'Exception', message: 'Quota limit exceeded' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await getFreshPreviewUrl('456')).toBeNull();
  });
});
