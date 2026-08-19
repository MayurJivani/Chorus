import type { GuessAttempt } from '../game/useGameState';
import { MAX_GUESSES } from '../../types/api';

/** `maxGuesses` is a parameter because it is an admin setting, not a constant — the pip row has
 *  to be as long as the schedule actually in force. Defaults to the shipped six. */
export function buildShareText(
  history: GuessAttempt[],
  won: boolean,
  puzzleDate: string,
  maxGuesses: number = MAX_GUESSES,
): string {
  const pips = Array.from({ length: maxGuesses }, (_, i) => {
    const attempt = history[i];
    if (!attempt) return '⬛'; // unused slot
    return attempt.correct ? '🟩' : '🟥';
  }).join('');

  const score = won ? `${history.length}/${maxGuesses}` : `X/${maxGuesses}`;

  return `Chorus ${puzzleDate} 🎵 ${score}\n${pips}`;
}
