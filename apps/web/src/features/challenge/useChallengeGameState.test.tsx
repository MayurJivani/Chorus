import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChallengeGameState } from './useChallengeGameState';

// The snippet schedule is an admin setting. This one is five stages, like the live deployment,
// where the shipped default is six — which is the whole point: the number Skip reports has to
// follow the setting rather than a constant compiled into the client.
vi.mock('../../hooks/useGameConfig', () => ({
  useGameConfig: () => ({ snippetSchedule: [2, 4, 8, 12, 16], maxGuesses: 5, challengeRounds: 10 }),
}));

/**
 * Skip used to send a hardcoded guess number of 6, from when the snippet schedule had six
 * stages. The schedule is an admin setting whose default is now five, and the server rejects
 * anything past its end — so every Skip in Artist and Category mode answered "Something went
 * wrong submitting that". These pin the number to the live config instead.
 */
const challenge = {
  challengeId: 1,
  label: 'Test',
  totalRounds: 10,
  currentRound: 0,
  songsCorrect: 0,
  previewUrl: 'x',
  snippetSchedule: [2, 4, 8, 12, 16],
  maxGuesses: 5,
  sessionComplete: false,
};

function endpoints(guess: ReturnType<typeof vi.fn>) {
  return {
    key: 'k',
    load: vi.fn().mockResolvedValue(challenge),
    guess,
    loadErrorMessage: 'nope',
  } as never;
}

describe('skipping a round', () => {
  it('reports the last attempt, not a number past the end of the schedule', async () => {
    const guess = vi.fn().mockResolvedValue({ correct: false, isFinal: true, song: null });
    const { result } = renderHook(() => useChallengeGameState(endpoints(guess), 'choice'));

    await waitFor(() => expect(result.current.status).toBe('playing'));
    await act(async () => {
      await result.current.skip();
    });

    expect(guess).toHaveBeenCalledTimes(1);
    const sent = guess.mock.calls[0]![0];
    // 6 — the old hardcoded value — is what the server rejected with "past the end of the
    // snippet schedule", surfacing as "Something went wrong submitting that".
    expect(sent.guessNumber).toBe(5);
    expect(sent.guessNumber).not.toBe(6);
    expect(sent.guessNumber).toBeLessThanOrEqual(challenge.snippetSchedule.length);
    expect(sent.deezerTrackId).toBeUndefined();
  });

  it('still reports the real attempt number for an actual guess', async () => {
    const guess = vi.fn().mockResolvedValue({ correct: false, isFinal: false });
    const { result } = renderHook(() => useChallengeGameState(endpoints(guess), 'search'));

    await waitFor(() => expect(result.current.status).toBe('playing'));
    await act(async () => {
      await result.current.guess({ id: 'track-1', title: 't', artist: 'a', albumArtUrl: null });
    });

    expect(guess.mock.calls[0]![0].guessNumber).toBe(1);
  });
});
