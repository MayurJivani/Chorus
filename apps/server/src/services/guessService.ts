import { MAX_GUESSES } from './puzzleService';

export function isCorrectGuess(guessedSongId: number, answerSongId: number): boolean {
  return guessedSongId === answerSongId;
}

export function isFinalAttempt(guessNumber: number, correct: boolean): boolean {
  return correct || guessNumber >= MAX_GUESSES;
}
