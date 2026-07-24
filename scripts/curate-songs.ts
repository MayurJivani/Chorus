import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from '../apps/server/src/db/client';
import { songs } from '../apps/server/src/db/schema';
import { isUnwantedVersion } from '../apps/server/src/utils/trackFilters';

interface Candidate {
  title: string;
  artist: string;
}

interface DeezerTrack {
  id: number;
  title: string;
  preview: string;
  duration: number;
  artist: { name: string };
  album?: { cover_medium?: string };
}

interface DeezerSearchResponse {
  data: DeezerTrack[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Deezer's search endpoint is public and keyless; a Referer header is sent as good
 * practice even though it isn't required for this unauthenticated endpoint. */
async function searchDeezer(query: string): Promise<DeezerTrack[]> {
  const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`, {
    headers: { Referer: 'https://chorus.app/' },
  });
  if (!res.ok) {
    throw new Error(`Deezer search failed with status ${res.status}`);
  }
  const body = (await res.json()) as DeezerSearchResponse;
  return body.data ?? [];
}

function pickBestMatch(results: DeezerTrack[]): DeezerTrack | null {
  const withPreview = results.filter((track) => Boolean(track.preview));
  if (withPreview.length === 0) return null;

  const clean = withPreview.filter((track) => !isUnwantedVersion(track.title));
  const pool = clean.length > 0 ? clean : withPreview;
  return pool[0] ?? null;
}

async function curateOne(candidate: Candidate): Promise<'inserted' | 'duplicate' | 'no-match'> {
  const results = await searchDeezer(`${candidate.artist} ${candidate.title}`);
  const match = pickBestMatch(results);

  if (!match) {
    return 'no-match';
  }

  const deezerTrackId = String(match.id);
  const existing = db.select().from(songs).where(eq(songs.deezerTrackId, deezerTrackId)).get();
  if (existing) {
    return 'duplicate';
  }

  db.insert(songs)
    .values({
      title: match.title,
      artist: match.artist.name,
      deezerTrackId,
      previewUrl: match.preview,
      albumArtUrl: match.album?.cover_medium ?? null,
      durationSeconds: match.duration,
    })
    .run();

  return 'inserted';
}

const scriptDir = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const candidatesPath = resolve(scriptDir, 'song-candidates.json');
  const candidates = JSON.parse(readFileSync(candidatesPath, 'utf-8')) as Candidate[];

  const tally = { inserted: 0, duplicate: 0, 'no-match': 0, error: 0 };

  for (const candidate of candidates) {
    const label = `${candidate.artist} - ${candidate.title}`;
    try {
      const outcome = await curateOne(candidate);
      tally[outcome] += 1;
      const marker = outcome === 'inserted' ? '+' : outcome === 'duplicate' ? '=' : 'x';
      console.log(`  ${marker} ${label} (${outcome})`);
    } catch (err) {
      tally.error += 1;
      console.error(`  ! ${label}:`, err instanceof Error ? err.message : err);
    }
    // Be a polite citizen of a free, keyless public API.
    await sleep(150);
  }

  console.log('\nCuration complete:');
  console.log(`  inserted:  ${tally.inserted}`);
  console.log(`  duplicate: ${tally.duplicate}`);
  console.log(`  no match:  ${tally['no-match']}`);
  console.log(`  errors:    ${tally.error}`);
}

main()
  .catch((err) => {
    console.error('Curation failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Ensure the process exits even if better-sqlite3 leaves the event loop alive.
    process.exit(process.exitCode ?? 0);
  });
