import { apiRequest } from './client';
import type {
  ArtistChallengeResponse,
  ArtistGuessResult,
  ArtistLeaderboardResponse,
  Category,
  GuessDistributionResponse,
  SongSearchResult,
} from '../types/api';

export async function getCategories(): Promise<Category[]> {
  const res = await apiRequest<{ categories: Category[] }>('/categories');
  return res.categories;
}

export function getCategoryChallenge(
  categoryId: string,
  playAgain?: boolean,
  mode?: 'search' | 'choice',
  challengeId?: number,
): Promise<ArtistChallengeResponse> {
  const query = new URLSearchParams({
    ...(playAgain ? { playAgain: 'true' } : {}),
    ...(mode ? { mode } : {}),
    ...(challengeId != null ? { challengeId: String(challengeId) } : {}),
  }).toString();
  return apiRequest<ArtistChallengeResponse>(
    `/categories/${encodeURIComponent(categoryId)}/challenge/today${query ? `?${query}` : ''}`,
  );
}

export function submitCategoryGuess(
  categoryId: string,
  input: { deezerTrackId?: string; guessNumber: number; guessMode?: 'search' | 'choice' },
): Promise<ArtistGuessResult> {
  return apiRequest<ArtistGuessResult>(
    `/categories/${encodeURIComponent(categoryId)}/challenge/today/guess`,
    { method: 'POST', body: input },
  );
}

export async function searchCategoryTracks(
  categoryId: string,
  query: string,
): Promise<SongSearchResult[]> {
  if (!query.trim()) return [];
  const res = await apiRequest<{
    results: { deezerTrackId: string; title: string; artist: string; albumArtUrl: string | null }[];
  }>(`/categories/${encodeURIComponent(categoryId)}/tracks/search?q=${encodeURIComponent(query)}`);
  return res.results.map((r) => ({
    id: r.deezerTrackId,
    title: r.title,
    artist: r.artist,
    albumArtUrl: r.albumArtUrl,
  }));
}

export function getCategoryLeaderboard(categoryId: string): Promise<ArtistLeaderboardResponse> {
  return apiRequest<ArtistLeaderboardResponse>(
    `/categories/${encodeURIComponent(categoryId)}/leaderboard`,
  );
}

export function getCategoryChallengeLeaderboard(
  categoryId: string,
  challengeId: number,
): Promise<{ entries: ArtistLeaderboardResponse['entries'] }> {
  return apiRequest(
    `/categories/${encodeURIComponent(categoryId)}/challenge/${challengeId}/leaderboard`,
  );
}

export function getCategoryGuessDistribution(
  categoryId: string,
): Promise<GuessDistributionResponse> {
  return apiRequest<GuessDistributionResponse>(
    `/categories/${encodeURIComponent(categoryId)}/stats/guess-distribution`,
  );
}
