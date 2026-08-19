import { apiRequest } from './client';
import type {
  SongSearchResult,
  SurvivalGuessResult,
  SurvivalLeaderboard,
  SurvivalRound,
} from '../types/api';

export function getSurvivalRound(mode: 'search' | 'choice'): Promise<SurvivalRound> {
  return apiRequest<SurvivalRound>(`/survival/round?mode=${mode}`);
}

export function submitSurvivalGuess(deezerTrackId?: string): Promise<SurvivalGuessResult> {
  return apiRequest<SurvivalGuessResult>('/survival/guess', {
    method: 'POST',
    body: { ...(deezerTrackId ? { deezerTrackId } : {}) },
  });
}

/** Abandons the run in progress, so the next round starts a fresh one. */
export function giveUpSurvivalRun(): Promise<{ ok: true }> {
  return apiRequest('/survival/give-up', { method: 'POST' });
}

export function getSurvivalLeaderboard(): Promise<SurvivalLeaderboard> {
  return apiRequest<SurvivalLeaderboard>('/survival/leaderboard');
}

export async function searchSurvivalTracks(query: string): Promise<SongSearchResult[]> {
  if (!query.trim()) return [];
  const res = await apiRequest<{
    results: { deezerTrackId: string; title: string; artist: string; albumArtUrl: string | null }[];
  }>(`/survival/tracks/search?q=${encodeURIComponent(query)}`);
  return res.results.map((r) => ({
    id: r.deezerTrackId,
    title: r.title,
    artist: r.artist,
    albumArtUrl: r.albumArtUrl,
  }));
}
