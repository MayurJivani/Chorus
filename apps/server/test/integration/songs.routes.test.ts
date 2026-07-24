import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { db } from '../../src/db/client';
import { songs } from '../../src/db/schema';

const app = createApp();

beforeEach(() => {
  db.delete(songs).run();
  db.insert(songs)
    .values([
      {
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
        deezerTrackId: 'dz-1',
        previewUrl: 'https://example.test/1.mp3',
        durationSeconds: 355,
      },
      {
        title: 'Billie Jean',
        artist: 'Michael Jackson',
        deezerTrackId: 'dz-2',
        previewUrl: 'https://example.test/2.mp3',
        durationSeconds: 294,
      },
      {
        title: 'Bad Romance',
        artist: 'Lady Gaga',
        deezerTrackId: 'dz-3',
        previewUrl: 'https://example.test/3.mp3',
        durationSeconds: 295,
        active: false,
      },
    ])
    .run();
});

describe('GET /api/songs/search', () => {
  it('finds songs by a title prefix', async () => {
    const res = await request(app).get('/api/songs/search').query({ q: 'Bohem' });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].title).toBe('Bohemian Rhapsody');
  });

  it('finds songs by artist', async () => {
    const res = await request(app).get('/api/songs/search').query({ q: 'Jackson' });
    expect(res.status).toBe(200);
    expect(res.body.results[0].artist).toBe('Michael Jackson');
  });

  it('excludes inactive songs', async () => {
    const res = await request(app).get('/api/songs/search').query({ q: 'Bad Romance' });
    expect(res.body.results).toHaveLength(0);
  });

  it('does not error on FTS5-special characters in the query', async () => {
    const res = await request(app).get('/api/songs/search').query({ q: '"quote AND OR *' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('rejects an empty query', async () => {
    const res = await request(app).get('/api/songs/search').query({ q: '' });
    expect(res.status).toBe(400);
  });
});
