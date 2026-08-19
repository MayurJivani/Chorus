import { apiRequest } from './client';
import type { ArtistLeaderboardResponse, EraGuessResult, EraRound } from '../types/api';

export function getEraChallenge(playAgain?: boolean): Promise<EraRound> {
  const query = playAgain ? '?playAgain=true' : '';
  return apiRequest<EraRound>(`/era/challenge/today${query}`);
}

export function submitEraGuess(input: {
  year?: number;
  guessNumber: number;
}): Promise<EraGuessResult> {
  return apiRequest<EraGuessResult>('/era/challenge/today/guess', {
    method: 'POST',
    body: input,
  });
}

export function getEraLeaderboard(): Promise<ArtistLeaderboardResponse> {
  return apiRequest<ArtistLeaderboardResponse>('/era/leaderboard');
}
