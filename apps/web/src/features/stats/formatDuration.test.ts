import { describe, it, expect } from 'vitest';
import { formatDuration } from './formatDuration';

describe('formatDuration', () => {
  it('shows a dash when there is no time to show', () => {
    expect(formatDuration(null)).toBe('—');
  });

  it.each([
    [0, '0s'],
    [4, '4s'],
    // Tenths are kept under a minute: the gap between 4.2s and 4.9s is the whole point of a
    // "fastest solve" figure.
    [4.2, '4.2s'],
    [59.9, '59.9s'],
  ])('formats %ss as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it.each([
    [60, '1m 0s'],
    [95, '1m 35s'],
    [3599, '59m 59s'],
    [3600, '1h 0m'],
    [7860, '2h 11m'],
  ])('formats %ss as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
