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
 * (e.g. "Ma Meilleure Ennemie ft. Coldplay") — a signal the searched artist may not be the
 * track's primary artist. */
export function mentionsFeature(title: string): boolean {
  const lower = title.toLowerCase();
  return FEATURE_TERMS.some((term) => lower.includes(term));
}
