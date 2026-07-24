import type { GuessAttempt } from '../game/useGameState';
import { MAX_GUESSES } from '../../types/api';

export function buildShareText(history: GuessAttempt[], won: boolean, puzzleDate: string): string {
  const pips = Array.from({ length: MAX_GUESSES }, (_, i) => {
    const attempt = history[i];
    if (!attempt) return '⬛'; // unused slot
    return attempt.correct ? '🟩' : '🟥';
  }).join('');

  const score = won ? `${history.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;

  return `Chorus ${puzzleDate} 🎵 ${score}\n${pips}`;
}
