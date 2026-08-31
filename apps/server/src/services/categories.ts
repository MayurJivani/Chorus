/**
 * The playable categories, backed by Deezer editorial playlists.
 *
 * Every entry is a hand-checked playlist id rather than a runtime search: searching Deezer for
 * "Top 2024" returns mostly user-made lists with the wrong year, the wrong region, or ten
 * tracks, so the category list would be different (and often junk) on every deploy.
 *
 * Two editorial accounts supply everything here — "Deezer Best Of" (4036701362) for the year
 * and genre retrospectives, and "Deezer Charts" (637006841) for the live worldwide chart.
 *
 * Region matters: Deezer's `/chart/{genre}` endpoints follow the *server's* IP, which would
 * make every "top now" list German for this deployment. The playlists below are the worldwide
 * editions, verified to return international tracks (Top Hits 2000 is Destiny's Child and
 * Britney; 2024 Pop is Espresso and Texas Hold 'Em).
 */
import { MOVIE_COLLECTIONS, type MovieAlbum } from './movies';

export type CategoryGroup = 'now' | 'year' | 'genre' | 'bollywood' | 'world' | 'movie';

export interface Category {
  /** Stable slug used in URLs and as the catalog cache key. */
  id: string;
  label: string;
  group: CategoryGroup;
  /** Deezer playlists backing the category. Tracks from all are merged and deduped.
   *  Empty for movie collections, which are built from albums instead. */
  playlistIds: string[];
  /** Shown under the label on the picker. */
  blurb: string;
  /**
   * Set only on Guess the Movie collections. Their pool is built from curated soundtrack albums
   * and the answer is the *film*, not the song — see movieCatalogService for why that changes
   * how options are rendered.
   */
  movies?: MovieAlbum[];
}

/** Deezer Charts' live worldwide top 100 plus its 2025 retrospective. */
const NOW: Category[] = [
  {
    id: 'now-worldwide',
    label: 'Top Worldwide Now',
    group: 'now',
    playlistIds: ['3155776842'],
    blurb: 'What the whole world is streaming right now',
  },
  {
    id: 'year-2025',
    label: 'Top Worldwide 2025',
    group: 'now',
    playlistIds: ['14575176963'],
    blurb: 'The biggest tracks of 2025',
  },
];

/** Decade-level mega pools (200–700+ tracks each) so replays are always fresh. */
const DECADES: Category[] = [
  {
    id: 'decade-2010s',
    label: '2010s Hits',
    group: 'year',
    playlistIds: ['13382725943', '8033720842'],
    blurb: '200+ songs from the 2010s decade',
  },
  {
    id: 'decade-2000s',
    label: '2000s Hits',
    group: 'year',
    playlistIds: ['15453873941', '10307642122'],
    blurb: '200+ throwback hits from the 2000s',
  },
  {
    id: 'decade-90s',
    label: '90s Hits',
    group: 'year',
    playlistIds: ['2924710862'],
    blurb: '270+ pop hits from the 1990s',
  },
  {
    id: 'decade-80s',
    label: '80s Hits',
    group: 'year',
    playlistIds: ['3403326002'],
    blurb: '200+ classics from the 1980s',
  },
  {
    id: 'greatest-hits',
    label: 'Greatest Hits Radio 500',
    group: 'year',
    playlistIds: ['14500567763'],
    blurb: '500 of the greatest songs ever',
  },
];

/** "Top Hits <year>" retrospectives, newest first. Deezer publishes these back to 1976; the
 *  list starts at 2000 so every category is something most players could plausibly name. */
const YEAR_PLAYLISTS: [year: number, playlistIds: string[]][] = [
  [2024, ['13154877883']],
  [2023, ['12345467671']],
  [2022, ['12345460211']],
  [2021, ['12345421311']],
  [2020, ['3185085222']],
  [2019, ['1283499335']],
  [2018, ['5132762464']],
  [2017, ['3453772742']],
  [2016, ['5310088722']],
  [2015, ['5310238702']],
  [2014, ['5310662982']],
  [2013, ['5310925582']],
  [2012, ['5311155022']],
  [2011, ['5313710582']],
  [2010, ['5339620562']],
  [2009, ['5361722742']],
  [2008, ['4091244662']],
  [2007, ['11837077721']],
  [2006, ['11837078821']],
  [2005, ['11837082861']],
  [2004, ['11837085661']],
  [2003, ['11837087601']],
  [2002, ['11837088801']],
  [2001, ['11837090081']],
  [2000, ['11837091441']],
];

const YEARS: Category[] = YEAR_PLAYLISTS.map(([year, playlistIds]) => ({
  id: `year-${year}`,
  label: `Top Hits ${year}`,
  group: 'year' as const,
  playlistIds,
  blurb: `The songs that defined ${year}`,
}));

/**
 * Genre retrospectives. Deliberately the mainstream genres only — Deezer also publishes
 * Melodic Techno, Tech House, Trance, Calm Piano and Zouk lists, but a category nobody can
 * name ten songs from is a bad round, not a hard one.
 */
const GENRE_DEFS: [label: string, playlistIds: string[]][] = [
  ['Pop 2024', ['13154877883']],
  ['Rock 2024', ['13238299403']],
  ['Rap 2024', ['13241781803']],
  ['R&B 2024', ['13241765403']],
  ['Dance 2024', ['13210162323']],
  ['Metal 2024', ['13238303063']],
  ['K-Pop 2024', ['13238288623']],
  ['Alternative 2024', ['13200273483']],
  ['Afro 2024', ['13241778203']],
  ['Soul 2024', ['13239089503']],
  ['Rock 2023', ['11906567121']],
  ['Latin 2023', ['11924528781']],
  ['Reggaeton 2023', ['11924529441']],
  ['K-Pop 2023', ['11924856141']],
  ['Electronic 2023', ['11903241081']],
  ['Metal 2023', ['11906567941']],
];

/**
 * All-time genre pools, as opposed to the year-pinned lists above.
 *
 * The existing genre entries are snapshots of one year, which is a different thing to ask of a
 * player: "Top Rock 2024" rewards knowing what came out recently, while "Rock Essentials" is a
 * canon most people can take a swing at. Both are worth having.
 *
 * Every id was checked live for size and, more importantly, preview coverage — a playlist whose
 * tracks have no 30-second previews is unplayable here and looks exactly like a broken game.
 * Several plausible candidates were rejected on that basis alone (one "R&B Classics" list had
 * previews on 3 of its first 14 tracks).
 */
const TIMELESS_GENRE_DEFS: [label: string, playlistIds: string[], blurb: string][] = [
  ['Rock Essentials', ['1306931615'], 'AC/DC, Bowie, Pink Floyd and the rest of the canon'],
  ['New Rock', ['1306978785'], 'What rock sounds like now'],
  ['Metal Essentials', ['2655390504'], 'Pantera, Megadeth and the heavy end'],
  ['Electronic Hits', ['1902101402'], 'Dance floor staples old and new'],
  ['Country Essentials', ['1294431447'], 'Johnny Cash, Patsy Cline and the classics'],
  ['Reggae Essentials', ['2448918882'], 'Bob Marley and the roots of the sound'],
  ['Jazz Essentials', ['1615514485'], 'Armstrong, Brubeck, Nina Simone'],
  ['2000s Hip-Hop & R&B', ['5243303306'], 'Kanye, Nelly, Amerie — the 00s radio years'],
];

const TIMELESS_GENRES: Category[] = TIMELESS_GENRE_DEFS.map(([label, playlistIds, blurb]) => ({
  id: `genre-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  label,
  group: 'genre' as const,
  playlistIds,
  blurb,
}));

/**
 * Music from outside the anglophone charts, which the rest of the catalog is heavily weighted
 * towards. Bollywood already has its own group; this is everywhere else.
 */
const WORLD_DEFS: [label: string, playlistIds: string[], blurb: string][] = [
  ['K-Pop', ['4096400722'], 'BTS, JENNIE and the current top of K-pop'],
  ['Latin Fuego', ['178699142'], 'Shakira, Quevedo and Latin pop heat'],
  ['Reggaeton', ['1273315391'], 'Bad Bunny, KAROL G, J Balvin'],
  ['Afrobeats', ['12325616651'], 'Tyla, Ayra Starr and the Afrobeats wave'],
  ['Tamil Hits', ['13523718423'], 'Anirudh and the newest Tamil chart'],
  ['Punjabi', ['4815158244'], '900+ Punjabi tracks, old school to now'],
];

const WORLD: Category[] = WORLD_DEFS.map(([label, playlistIds, blurb]) => ({
  id: `world-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  label,
  group: 'world' as const,
  playlistIds,
  blurb,
}));

const GENRES: Category[] = GENRE_DEFS.map(([label, playlistIds]) => ({
  id: `genre-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  label: `Top ${label}`,
  group: 'genre' as const,
  playlistIds,
  blurb: `The best of ${label}`,
}));

/**
 * Bollywood / Indian music. Deezer's editorial playlists cover this well — "Best Of Bollywood"
 * and year-specific compilations exist and are maintained. Playlist ids verified to contain
 * Hindi-language tracks with working previews.
 */
const BOLLYWOOD_DEFS: [label: string, playlistIds: string[], blurb: string][] = [
  ['Bollywood All Time', ['15397365263'], '300+ of the best Bollywood songs ever'],
  ['Bollywood 2010–2024', ['15608630823'], '700+ hits from the last fifteen years'],
  ['Bollywood 2020s', ['15558969283'], '350+ songs from this decade'],
  ['Bollywood Top 500', ['5510742242'], 'Hindi all-time top 500'],
  ['Bollywood Romance', ['10421653842'], 'Love songs from the silver screen'],
  ['Bollywood Party', ['9660774522'], 'Dance floor anthems from Hindi films'],
  ['Bollywood 2026', ['14922241343'], 'The latest Bollywood hits'],
  // Repointed after the originals stopped resolving on Deezer: 5855498562 had shrunk to two
  // tracks (under MIN_CATEGORY_TRACKS) and 4803995402 / 3060498806 both answer with
  // {"error":"no data"}. Worth knowing the failure mode — a dead playlist id surfaces only when
  // someone tries to start a game, as "not enough playable tracks", which reads like a bug in
  // the game rather than a playlist that no longer exists. If a category refuses to start, check
  // its id against https://api.deezer.com/playlist/<id> before looking anywhere else.
  ['Bollywood Sad Songs', ['11485931584'], 'Heartbreak anthems from Hindi cinema'],
  ['Bollywood Retro', ['11193162724'], 'Timeless old-school Bollywood'],
  ['Arijit Singh Hits', ['14001087101'], 'Best of the modern Bollywood voice'],
];

const BOLLYWOOD: Category[] = BOLLYWOOD_DEFS.map(([label, playlistIds, blurb]) => ({
  id: `bollywood-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  label,
  group: 'bollywood' as CategoryGroup,
  playlistIds,
  blurb,
}));

/**
 * Guess the Movie collections. They ride the category system rather than being a mode of their
 * own: a category is already "an id, a label, and a way to load a track pool", which is exactly
 * what these are, so the picker, multiplayer rooms, duel matchmaking, live player counts and
 * leaderboards all work with no changes. Only the pool builder and the option rendering differ.
 */
const MOVIES: Category[] = MOVIE_COLLECTIONS.map((collection) => ({
  id: collection.id,
  label: collection.label,
  group: 'movie' as const,
  playlistIds: [],
  blurb: collection.blurb,
  movies: collection.movies,
}));

export const CATEGORIES: Category[] = [
  ...NOW,
  ...DECADES,
  ...YEARS,
  ...GENRES,
  ...TIMELESS_GENRES,
  ...WORLD,
  ...BOLLYWOOD,
  ...MOVIES,
];

/** True when the category's rounds ask for a film rather than a song. */
export function isMovieCategory(category: Category): boolean {
  return !!category.movies && category.movies.length > 0;
}

/*
 * Slugs are derived from labels, so a new entry can silently collide with an existing one and
 * shadow it in the id map. Cheap to check at import, and the alternative is a category that
 * quietly plays the wrong songs.
 */
const duplicateIds = CATEGORIES.map((c) => c.id).filter((id, i, all) => all.indexOf(id) !== i);
if (duplicateIds.length > 0) {
  throw new Error(`Duplicate category ids: ${[...new Set(duplicateIds)].join(', ')}`);
}

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function findCategory(id: string): Category | null {
  return BY_ID.get(id) ?? null;
}
