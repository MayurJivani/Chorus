/** Shared title-quality checks used anywhere a track title from Deezer needs filtering —
 * song-bank curation, re-verification, and Artist Mode's live discography lookups. */

const UNWANTED_VERSION_TERMS = [
  'karaoke',
  'tribute',
  'made famous by',
  'cover version',
  'in the style of',
  'acoustic',
  'live',
  'remix',
  'instrumental',
  'demo',
  'rehearsal',
  'sped up',
  'slowed',
  'extended mix',
  'radio edit',
  // Spoken-word album filler — these are *about* a song rather than a recording of one,
  // so they are never guessable ("Wood (Track by Track)" is Taylor Swift talking, not "Wood").
  'track by track',
  'commentary',
  'interview',
  'voice memo',
  'behind the scenes',
  'skit',
];

// Word-boundary matched, so the punctuation/trailing-space variants these used to need
// ('feat.', 'feat ', 'ft.', 'ft ') collapse into one entry each.
const FEATURE_TERMS = ['feat', 'ft', 'featuring'];

/** Content that marks a parenthetical/dash suffix as an alternate *version* of a song
 *  (e.g. "(2x Speed)", "(Album Version)", "- Live at Wembley") rather than part of its
 *  real name. Used to collapse versions down to the main recording. */
const VERSION_MARKER_TERMS = [
  'version',
  'remix',
  'remaster',
  'edit',
  'speed',
  'sped',
  'slowed',
  'reverb',
  'nightcore',
  'acoustic',
  'live',
  'demo',
  'rehearsal',
  'instrumental',
  'karaoke',
  'tribute',
  'cover',
  'session',
  'mix',
  'explicit',
  'clean',
  'dirty',
  'bonus',
  'deluxe',
  'video',
  'lyric',
  'vocals',
  'acapella',
  'official',
];

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Matches `term` against already-normalized text on whole-word boundaries only. Plain
 * substring matching silently ate real songs — "live" matched *A*live*, De*live*ry, O*live*
 * and S*live*r; "demo" matched *Demo*ns — so every term check goes through here. Normalized
 * text contains only `[a-z0-9 ]`, which makes `\b` an exact word-edge test, while multi-word
 * terms ("sped up", "made famous by") still match as a phrase.
 */
const wordMatcherCache = new Map<string, RegExp>();

function matchesTerm(normalizedText: string, term: string): boolean {
  let matcher = wordMatcherCache.get(term);
  if (!matcher) {
    matcher = new RegExp(`\\b${normalizeTitle(term)}\\b`);
    wordMatcherCache.set(term, matcher);
  }
  return matcher.test(normalizedText);
}

/** True for karaoke/tribute/acoustic/live/remix/etc. versions — never a good pick for a
 * guessing game, which wants the recognizable original recording. */
export function isUnwantedVersion(title: string): boolean {
  const normalized = normalizeTitle(title);
  return UNWANTED_VERSION_TERMS.some((term) => matchesTerm(normalized, term));
}

/** True when the title itself credits another artist as a feature/collaboration
 *  (e.g. "Ma Meilleure Ennemie ft. Coldplay") — a signal the searched artist may not be the
 *  track's primary artist. */
export function mentionsFeature(title: string): boolean {
  const normalized = normalizeTitle(title);
  return FEATURE_TERMS.some((term) => matchesTerm(normalized, term));
}

function isVersionMarker(content: string): boolean {
  // Speed variants ("2x", "0.5x") are checked before normalization, which would split "0.5x"
  // into "0 5x" and lose the decimal.
  if (/\d+(?:\.\d+)?x\b/.test(content.toLowerCase())) return true;
  const normalized = normalizeTitle(content);
  return VERSION_MARKER_TERMS.some((term) => matchesTerm(normalized, term));
}

/** Strips alternate-version suffixes from a title, leaving the song's core name —
 *  e.g. "Eyes Closed (2x Speed)" → "Eyes Closed", "Pillowtalk (Living Room Session)" →
 *  "Pillowtalk", "Yellow - Live at Wembley" → "Yellow". Only trailing qualifiers that look
 *  like version markers are removed, so real parenthetical titles ("Single Ladies (Put a
 *  Ring on It)") are left untouched. Used to dedupe a discography down to the main version. */
export function stripVersionSuffix(title: string): string {
  let result = title.trim();
  let changed = true;
  while (changed) {
    changed = false;
    const paren = result.match(/\(([^)]*)\)\s*$/);
    if (paren && isVersionMarker(paren[1] ?? '')) {
      result = (result.slice(0, paren.index) ?? result).trimEnd();
      changed = true;
      continue;
    }
    const dash = result.match(/[-–—]\s*(.+)$/);
    if (dash && isVersionMarker(dash[1] ?? '')) {
      result = (result.slice(0, dash.index) ?? result).trimEnd();
      changed = true;
    }
  }
  return result.trim();
}
