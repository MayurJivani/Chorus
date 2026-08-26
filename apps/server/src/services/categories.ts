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
export type CategoryGroup = 'now' | 'year' | 'genre' | 'bollywood';

export interface Category {
  /** Stable slug used in URLs and as the catalog cache key. */
  id: string;
  label: string;
  group: CategoryGroup;
  /** Deezer playlists backing the category. Tracks from all are merged and deduped. */
  playlistIds: string[];
  /** Shown under the label on the picker. */
  blurb: string;
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

/** "Top Hits <year>" retrospectives, newest first. Deezer publishes these back to 1976; the
 *  list starts at 2000 so every category is something most players could plausibly name.
 *  Each year carries multiple playlists (main + regional/genre variants) to push the pool
 *  well past 100 tracks, giving replays fresh songs each time. */
const YEAR_PLAYLISTS: [year: number, playlistIds: string[]][] = [
  [2024, ['13154877883', '13238299403', '13241781803']],
  [2023, ['12345467671', '11906567121', '11924528781', '11903241081']],
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
  ['Bollywood Top 50', ['5714603022'], 'The biggest Bollywood songs of all time'],
  ['Bollywood 2000s', ['9598289882'], 'Nostalgia hits from 2000 to 2010'],
  ['Bollywood Romance', ['10421653842'], 'Love songs from the silver screen'],
  ['Bollywood Party', ['9660774522'], 'Dance floor anthems from Hindi films'],
  ['Bollywood 2026', ['14922241343'], 'The latest Bollywood hits'],
  ['Bollywood 90s', ['1996212882'], 'Golden era classics from the 90s'],
  ['Bollywood Sad Songs', ['5855498562'], 'Heartbreak anthems from Hindi cinema'],
  ['Bollywood Retro', ['4803995402'], 'Timeless old-school Bollywood'],
  ['Bollywood Unplugged', ['6062891064'], 'Acoustic and stripped-back renditions'],
  ['Arijit Singh Hits', ['3060498806'], 'Best of the modern Bollywood voice'],
];

const BOLLYWOOD: Category[] = BOLLYWOOD_DEFS.map(([label, playlistIds, blurb]) => ({
  id: `bollywood-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  label,
  group: 'bollywood' as CategoryGroup,
  playlistIds,
  blurb,
}));

export const CATEGORIES: Category[] = [...NOW, ...YEARS, ...GENRES, ...BOLLYWOOD];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function findCategory(id: string): Category | null {
  return BY_ID.get(id) ?? null;
}
