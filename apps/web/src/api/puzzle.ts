import { apiRequest } from './client';
import type { GuessResult, PuzzleResponse } from '../types/api';

export function getTodaysPuzzle(): Promise<PuzzleResponse> {
  return apiRequest<PuzzleResponse>('/puzzle/today');
}

export function submitGuess(input: { songId?: number; guessNumber: number }): Promise<GuessResult> {
  return apiRequest<GuessResult>('/puzzle/today/guess', { method: 'POST', body: input });
}
