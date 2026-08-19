export function isCorrectGuess(guessedSongId: number, answerSongId: number): boolean {
  return guessedSongId === answerSongId;
}

/**
 * Whether this attempt ends the round — either it was right, or it was the last one.
 *
 * `maxGuesses` is passed in rather than read from a constant: the guess count is the length of
 * the admin-configurable snippet schedule, so it is only known per request.
 */
export function isFinalAttempt(guessNumber: number, correct: boolean, maxGuesses: number): boolean {
  return correct || guessNumber >= maxGuesses;
}
