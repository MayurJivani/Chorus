import { describe, it, expect } from 'vitest';
import { buildShareText } from './shareText';
import type { GuessAttempt } from '../game/useGameState';

describe('buildShareText', () => {
  it('renders a win with the correct pip pattern and score', () => {
    const history: GuessAttempt[] = [
      { song: { id: 1, title: 'Wrong', artist: 'X', albumArtUrl: null }, correct: false },
      { song: { id: 2, title: 'Right', artist: 'Y', albumArtUrl: null }, correct: true },
    ];

    const text = buildShareText(history, true, '2026-01-01');
    expect(text).toBe('Chorus 2026-01-01 🎵 2/6\n🟥🟩⬛⬛⬛⬛');
  });

  it('renders a loss with X/6 and all attempts as red', () => {
    const history: GuessAttempt[] = Array.from({ length: 6 }, () => ({
      song: null,
      correct: false,
    }));

    const text = buildShareText(history, false, '2026-01-02');
    expect(text).toBe('Chorus 2026-01-02 🎵 X/6\n🟥🟥🟥🟥🟥🟥');
  });

  it('represents a skip the same as a wrong guess', () => {
    const history: GuessAttempt[] = [{ song: null, correct: false }];
    const text = buildShareText(history, false, '2026-01-03');
    expect(text.endsWith('🟥⬛⬛⬛⬛⬛')).toBe(true);
  });
});
