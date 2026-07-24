import { apiRequest } from './client';
import type {
  ArtistChallengeResponse,
  ArtistGuessResult,
  ArtistLeaderboardResponse,
  ChallengeLeaderboardResponse,
  ArtistSearchResult,
  SongSearchResult,
} from '../types/api';

export async function searchArtists(query: string): Promise<ArtistSearchResult[]> {
  if (!query.trim()) return [];
  const res = await apiRequest<{ results: ArtistSearchResult[] }>(
    `/artists/search?q=${encodeURIComponent(query)}`,
  );
  return res.results;
}

export function getArtistChallenge(
  artistId: number,
  includeFeatures: boolean,
  playAgain?: boolean,
  mode?: 'search' | 'choice',
  challengeId?: number,
): Promise<ArtistChallengeResponse> {
  const query = new URLSearchParams({
    includeFeatures: String(includeFeatures),
    ...(playAgain ? { playAgain: 'true' } : {}),
    ...(mode ? { mode } : {}),
    ...(challengeId != null ? { challengeId: String(challengeId) } : {}),
  }).toString();
  return apiRequest<ArtistChallengeResponse>(`/artists/${artistId}/challenge/today?${query}`);
}

export function submitArtistGuess(
  artistId: number,
  input: { deezerTrackId?: string; guessNumber: number; guessMode?: 'search' | 'choice' },
  includeFeatures: boolean,
): Promise<ArtistGuessResult> {
  return apiRequest<ArtistGuessResult>(
    `/artists/${artistId}/challenge/today/guess?includeFeatures=${includeFeatures}`,
    { method: 'POST', body: input },
  );
}

export async function searchArtistTracks(
  artistId: number,
  query: string,
  includeFeatures: boolean,
): Promise<SongSearchResult[]> {
  if (!query.trim()) return [];
  const res = await apiRequest<{
    results: { deezerTrackId: string; title: string; artist: string; albumArtUrl: string | null }[];
  }>(
    `/artists/${artistId}/tracks/search?q=${encodeURIComponent(query)}&includeFeatures=${includeFeatures}`,
  );
  return res.results.map((r) => ({
    id: r.deezerTrackId,
    title: r.title,
    artist: r.artist,
    albumArtUrl: r.albumArtUrl,
  }));
}

export function getArtistLeaderboard(artistId: number): Promise<ArtistLeaderboardResponse> {
  return apiRequest<ArtistLeaderboardResponse>(`/artists/${artistId}/leaderboard`);
}

export function getChallengeLeaderboard(
  artistId: number,
  challengeId: number,
): Promise<ChallengeLeaderboardResponse> {
  return apiRequest<ChallengeLeaderboardResponse>(
    `/artists/${artistId}/challenge/${challengeId}/leaderboard`,
  );
}
