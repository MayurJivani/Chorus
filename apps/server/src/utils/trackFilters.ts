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
];

const FEATURE_TERMS = ['feat.', 'feat ', 'ft.', 'ft ', 'featuring'];

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

/** True for karaoke/tribute/acoustic/live/remix/etc. versions — never a good pick for a
 * guessing game, which wants the recognizable original recording. */
export function isUnwantedVersion(title: string): boolean {
  const normalized = normalizeTitle(title);
  return UNWANTED_VERSION_TERMS.some((term) => normalized.includes(normalizeTitle(term)));
}

/** True when the title itself credits another artist as a feature/collaboration
 *  (e.g. "Ma Meilleure Ennemie ft. Coldplay") — a signal the searched artist may not be the
 *  track's primary artist. */
export function mentionsFeature(title: string): boolean {
  const lower = title.toLowerCase();
  return FEATURE_TERMS.some((term) => lower.includes(term));
}

function isVersionMarker(content: string): boolean {
  const lower = content.toLowerCase();
  if (/\d+(?:\.\d+)?x/.test(lower)) return true; // 2x / 0.5x / 1.5x speed variants
  return VERSION_MARKER_TERMS.some((term) => lower.includes(term));
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
