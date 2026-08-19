import { describe, it, expect } from 'vitest';
import { isCorrectGuess, isFinalAttempt } from '../../src/services/guessService';
import { MAX_GUESSES } from '../../src/services/puzzleService';

describe('isCorrectGuess', () => {
  it('matches when the guessed song id equals the answer', () => {
    expect(isCorrectGuess(42, 42)).toBe(true);
  });

  it('does not match a different song id', () => {
    expect(isCorrectGuess(1, 2)).toBe(false);
  });
});

describe('isFinalAttempt', () => {
  it('is final on a correct guess regardless of attempt number', () => {
    expect(isFinalAttempt(1, true, MAX_GUESSES)).toBe(true);
    expect(isFinalAttempt(3, true, MAX_GUESSES)).toBe(true);
  });

  it('is not final on a wrong guess before the last attempt', () => {
    expect(isFinalAttempt(1, false, MAX_GUESSES)).toBe(false);
    expect(isFinalAttempt(MAX_GUESSES - 1, false, MAX_GUESSES)).toBe(false);
  });

  it('is final on the last allowed attempt even if wrong', () => {
    expect(isFinalAttempt(MAX_GUESSES, false, MAX_GUESSES)).toBe(true);
  });
});
