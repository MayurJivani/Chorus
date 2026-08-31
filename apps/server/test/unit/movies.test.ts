import { describe, it, expect } from 'vitest';
import { MOVIE_COLLECTIONS } from '../../src/services/movies';
import { CATEGORIES, findCategory, isMovieCategory } from '../../src/services/categories';
import { __testing } from '../../src/services/movieCatalogService';
import { buildRoundOptions } from '../../src/services/artistChallengeService';
import type { ArtistTrack } from '../../src/services/deezerService';

const { buildMoviePool, isNonSong, isTooIncomplete } = __testing;

/** A pool row shaped the way movieCatalogService emits them: title is the film. */
function movieTrack(id: string, movie: string, song: string): ArtistTrack {
  return {
    deezerTrackId: id,
    title: movie,
    artist: song,
    albumArtUrl: null,
    durationSeconds: 200,
  };
}

describe('movie collections', () => {
  it('registers each collection as a playable category', () => {
    for (const collection of MOVIE_COLLECTIONS) {
      const category = findCategory(collection.id);
      expect(category, `${collection.id} should be a category`).toBeTruthy();
      expect(category!.group).toBe('movie');
      expect(isMovieCategory(category!)).toBe(true);
    }
  });

  it('leaves every non-movie category unaffected', () => {
    const nonMovie = CATEGORIES.filter((c) => c.group !== 'movie');
    expect(nonMovie.length).toBeGreaterThan(50);
    expect(nonMovie.every((c) => !isMovieCategory(c))).toBe(true);
    // Playlist-backed categories must still have playlists, or they silently stop loading.
    expect(nonMovie.every((c) => c.playlistIds.length > 0)).toBe(true);
  });

  it('gives every collection enough films to fill a four-option round', () => {
    for (const collection of MOVIE_COLLECTIONS) {
      expect(collection.movies.length, collection.id).toBeGreaterThanOrEqual(4);
    }
  });

  it('never points two films at the same album', () => {
    for (const collection of MOVIE_COLLECTIONS) {
      const ids = collection.movies.map((m) => m.albumId);
      expect(new Set(ids).size, `${collection.id} has a duplicate album id`).toBe(ids.length);
    }
  });
});

describe('isNonSong', () => {
  it('drops dialogue and score filler that sits on soundtrack albums', () => {
    // Dilwale Dulhania Le Jayenge's top album is 24 tracks of exactly this.
    expect(isNonSong('Dilwale Dulhania Le Jayenge (Dialogues)')).toBe(true);
    expect(isNonSong('Main Titles (You’ve Been Called Back to Top Gun)')).toBe(true);
    expect(isNonSong('Farmyard (Outtake)')).toBe(true);
    expect(isNonSong('Overture/And All That Jazz')).toBe(true);
    expect(isNonSong('No One Mourns the Wicked (Sing-Along)')).toBe(true);
  });

  it("keeps a score album's title cues, which are its best-known tracks", () => {
    // Applying the song filter to a score collection would delete exactly the rounds worth
    // having: these are the themes, not filler.
    expect(isNonSong('Main Title', 'score')).toBe(false);
    expect(isNonSong('Opening Titles', 'score')).toBe(false);
    expect(isNonSong('Overture', 'score')).toBe(false);
    expect(isNonSong('Prologue', 'score')).toBe(false);
    // Recorded speech is still unguessable, whatever the collection.
    expect(isNonSong('"You don\'t dream in cryo. ...." (Dialogue)', 'score')).toBe(true);
  });

  it('keeps real songs whose titles brush against those words', () => {
    // "Theme" is deliberately not a rejected term: these are the recognisable recordings.
    expect(isNonSong('Love Theme From Flashdance')).toBe(false);
    expect(isNonSong('Theme from Shaft')).toBe(false);
    expect(isNonSong('Tum Hi Ho')).toBe(false);
    expect(isNonSong('Stayin’ Alive')).toBe(false);
    // "Scorekeeper" contains "score" but not as a word — the check is word-boundary matched.
    expect(isNonSong('Scoreboard Pressure')).toBe(false);
  });
});

describe('buildMoviePool', () => {
  it('keeps every song from a film rather than collapsing them into one row', () => {
    // The pool's `title` is the film, so a title-keyed dedupe would reduce each album to a
    // single track and leave the mode with one round per movie.
    const pool = buildMoviePool([
      movieTrack('1', 'Jab We Met', 'Tum Se Hi · Mohit Chauhan'),
      movieTrack('2', 'Jab We Met', 'Mauja Hi Mauja · Mika Singh'),
      movieTrack('3', 'Jab We Met', 'Ye Ishq Hai · Shreya Ghoshal'),
    ]);
    expect(pool).toHaveLength(3);
  });

  it('drops the same song listed twice', () => {
    const pool = buildMoviePool([
      movieTrack('1', 'Jab We Met', 'Tum Se Hi · Mohit Chauhan'),
      movieTrack('2', 'Jab We Met', 'Tum Se Hi · Mohit Chauhan'),
    ]);
    expect(pool).toHaveLength(1);
  });
});

describe('buildRoundOptions for movie rounds', () => {
  const pool = [
    movieTrack('1', 'Jab We Met', 'Tum Se Hi · Mohit Chauhan'),
    movieTrack('2', 'Jab We Met', 'Mauja Hi Mauja · Mika Singh'),
    movieTrack('3', 'Gully Boy', 'Apna Time Aayega · Ranveer Singh'),
    movieTrack('4', 'Brahmastra', 'Kesariya · Arijit Singh'),
    movieTrack('5', 'Dangal', 'Dhaakad · Raftaar'),
    movieTrack('6', 'Tamasha', 'Agar Tum Saath Ho · Alka Yagnik'),
  ];

  it('never names the song that is playing', () => {
    // The whole mode rests on this: an option carrying "Tum Se Hi · Mohit Chauhan" would let
    // anyone who recognises the track read the answer off the list instead of knowing the film.
    const options = buildRoundOptions(pool[0]!, pool, 4, true);
    expect(options).toHaveLength(4);
    expect(options.every((o) => o.artist === '')).toBe(true);
    expect(options.some((o) => o.title === 'Jab We Met')).toBe(true);
  });

  it('offers four different films, never the same film twice', () => {
    for (let i = 0; i < 25; i++) {
      const options = buildRoundOptions(pool[0]!, pool, 4, true);
      const films = options.map((o) => o.title);
      expect(new Set(films).size).toBe(films.length);
    }
  });

  it('still includes the correct track id so the guess check is unchanged', () => {
    const options = buildRoundOptions(pool[2]!, pool, 4, true);
    const correct = options.find((o) => o.deezerTrackId === '3');
    expect(correct).toBeDefined();
    expect(correct!.title).toBe('Gully Boy');
  });

  it('leaves song rounds showing the artist as before', () => {
    const songPool = [
      { ...movieTrack('1', 'Tum Hi Ho', 'Arijit Singh') },
      { ...movieTrack('2', 'Kesariya', 'Arijit Singh') },
      { ...movieTrack('3', 'Apna Time Aayega', 'Ranveer Singh') },
      { ...movieTrack('4', 'Dhaakad', 'Raftaar') },
    ];
    const options = buildRoundOptions(songPool[0]!, songPool, 4);
    expect(options.every((o) => o.artist !== '')).toBe(true);
  });
});

describe('isTooIncomplete', () => {
  it('rejects a build that lost a meaningful share of its films', () => {
    // The real failure this guards: 69 albums fired at once, Deezer throttled the tail, and 15
    // films went missing. Nothing surfaced — they simply stopped being possible answers — and
    // the partial pool was cached as if it were complete.
    expect(isTooIncomplete(15, 69)).toBe(true);
  });

  it('tolerates the odd album that genuinely will not load', () => {
    expect(isTooIncomplete(0, 69)).toBe(false);
    expect(isTooIncomplete(1, 69)).toBe(false);
    expect(isTooIncomplete(6, 69)).toBe(false);
  });

  it('still allows one failure in a small collection', () => {
    // Without the floor of 1, a 4-film collection would refuse to store on any failure at all.
    expect(isTooIncomplete(1, 4)).toBe(false);
    expect(isTooIncomplete(2, 4)).toBe(true);
  });
});
