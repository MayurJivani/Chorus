import { describe, it, expect } from 'vitest';
import { buildShareText, buildRunShareText, buildSurvivalShareText } from './shareText';
import type { GuessAttempt } from '../game/useGameState';

describe('buildShareText', () => {
  it('renders a win with the correct pip pattern and score', () => {
    const history: GuessAttempt[] = [
      { song: { id: 1, title: 'Wrong', artist: 'X', albumArtUrl: null }, correct: false },
      { song: { id: 2, title: 'Right', artist: 'Y', albumArtUrl: null }, correct: true },
    ];

    const text = buildShareText(history, true, '2026-01-01');
    expect(text).toBe('Chorusify 2026-01-01 🎵 2/6\n🟥🟩⬛⬛⬛⬛');
  });

  it('renders a loss with X/6 and all attempts as red', () => {
    const history: GuessAttempt[] = Array.from({ length: 6 }, () => ({
      song: null,
      correct: false,
    }));

    const text = buildShareText(history, false, '2026-01-02');
    expect(text).toBe('Chorusify 2026-01-02 🎵 X/6\n🟥🟥🟥🟥🟥🟥');
  });

  it('represents a skip the same as a wrong guess', () => {
    const history: GuessAttempt[] = [{ song: null, correct: false }];
    const text = buildShareText(history, false, '2026-01-03');
    expect(text.endsWith('🟥⬛⬛⬛⬛⬛')).toBe(true);
  });
});

describe('buildRunShareText', () => {
  it('draws one square per song, in the order they were answered', () => {
    const text = buildRunShareText({
      subject: 'Queen',
      history: [true, false, true],
      songsCorrect: 2,
      totalRounds: 3,
    });

    expect(text).toContain('Chorusify · Queen 🎵 2/3');
    expect(text).toContain('🟩🟥🟩');
  });

  it('pads an unfinished run so the score still reads out of the full length', () => {
    const text = buildRunShareText({
      subject: 'Queen',
      history: [true, true],
      songsCorrect: 2,
      totalRounds: 5,
    });

    expect(text).toContain('🟩🟩⬛⬛⬛');
  });

  it('wraps at ten per line so long runs stay a sensible width', () => {
    const text = buildRunShareText({
      subject: 'Top Hits 2024',
      history: Array.from({ length: 12 }, () => true),
      songsCorrect: 12,
      totalRounds: 12,
    });

    const gridLines = text.split('\n').filter((line) => line.startsWith('🟩'));
    expect(gridLines).toHaveLength(2);
    // Counted in code points: each square is a surrogate pair, so `.length` would say 20.
    expect([...gridLines[0]!]).toHaveLength(10);
    expect([...gridLines[1]!]).toHaveLength(2);
  });

  it('includes the time and link when given, and omits them when not', () => {
    const withExtras = buildRunShareText({
      subject: 'Queen',
      history: [true],
      songsCorrect: 1,
      totalRounds: 1,
      timeTakenSeconds: 95,
      url: 'https://chorusify.com/x',
    });
    expect(withExtras).toContain('1m 35s');
    expect(withExtras).toContain('https://chorusify.com/x');

    const bare = buildRunShareText({
      subject: 'Queen',
      history: [true],
      songsCorrect: 1,
      totalRounds: 1,
    });
    expect(bare).not.toContain('·  ');
    expect(bare.split('\n')).toHaveLength(2);
  });

  it('never leaks a song title, which is what makes it safe to post', () => {
    const text = buildRunShareText({
      subject: 'Queen',
      history: [true, false],
      songsCorrect: 1,
      totalRounds: 2,
    });
    expect(text).not.toMatch(/Bohemian|Rhapsody/i);
  });
});

describe('buildSurvivalShareText', () => {
  it('leads with the streak', () => {
    expect(buildSurvivalShareText(23)).toContain('23 in a row');
  });

  it('marks a zero-streak run with a skull rather than flames', () => {
    expect(buildSurvivalShareText(0)).toContain('💀');
  });

  it('scales the flames with the streak, capped so it stays readable', () => {
    expect(buildSurvivalShareText(3)).toContain('🔥');
    expect([...buildSurvivalShareText(100)].filter((c) => c === '🔥')).toHaveLength(5);
  });
});
