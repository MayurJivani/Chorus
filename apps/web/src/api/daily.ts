import { apiRequest } from './client';
import type {
  ArtistChallengeResponse,
  ArtistGuessResult,
  ArtistLeaderboardEntry,
  SongSearchResult,
} from '../types/api';

export function getDailyChallenge(
  mode?: 'search' | 'choice',
): Promise<ArtistChallengeResponse & { date: string }> {
  const query = mode ? `?mode=${mode}` : '';
  return apiRequest(`/daily/today${query}`);
}

export function submitDailyGuess(input: {
  deezerTrackId?: string;
  guessNumber: number;
  guessMode?: 'search' | 'choice';
}): Promise<ArtistGuessResult> {
  return apiRequest<ArtistGuessResult>('/daily/today/guess', {
    method: 'POST',
    body: input,
  });
}

export async function searchDailyTracks(query: string): Promise<SongSearchResult[]> {
  if (!query.trim()) return [];
  const res = await apiRequest<{
    results: { deezerTrackId: string; title: string; artist: string; albumArtUrl: string | null }[];
  }>(`/daily/tracks/search?q=${encodeURIComponent(query)}`);
  return res.results.map((r) => ({
    id: r.deezerTrackId,
    title: r.title,
    artist: r.artist,
    albumArtUrl: r.albumArtUrl,
  }));
}

export function getDailyLeaderboard(): Promise<{ entries: ArtistLeaderboardEntry[] }> {
  return apiRequest('/daily/leaderboard');
}
