import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  getArtistChallenge: vi.fn(),
  submitArtistGuess: vi.fn(),
}));

vi.mock('../../api/artists', () => api);

import { useArtistGameState } from './useArtistGameState';

const challenge = {
  challengeId: 1,
  artistName: 'Queen',
  artistPictureUrl: null,
  totalRounds: 10,
  currentRound: 9,
  songsCorrect: 4,
  totalGuessesUsed: 50,
  completed: false,
  previewUrl: 'https://example.test/p.mp3',
  snippetSchedule: [1, 2, 4, 7, 11, 16],
  maxGuesses: 6,
};

const revealed = { title: 'Bohemian Rhapsody', artist: 'Queen', albumArtUrl: null };

beforeEach(() => {
  vi.clearAllMocks();
  api.getArtistChallenge.mockResolvedValue(challenge);
});

function renderGame() {
  return renderHook(() => useArtistGameState(412, false, 'search'));
}

describe('useArtistGameState, final round', () => {
  it('reveals the tenth song after a skip instead of jumping to the summary', async () => {
    // A skip that exhausts the last attempt of the last round: the run is over, but the
    // player has not been told what the song was yet.
    api.submitArtistGuess.mockResolvedValue({
      correct: false,
      isFinal: true,
      song: revealed,
      songsCorrect: 4,
      currentRound: 9,
      sessionComplete: true,
      timeTakenSeconds: 120,
      finalScore: { songsCorrect: 4, totalGuessesUsed: 60, timeTakenSeconds: 120, totalRounds: 10 },
    });

    const { result } = renderGame();
    await waitFor(() => expect(result.current.status).toBe('playing'));

    await act(async () => {
      await result.current.skip();
    });

    // The regression: this used to be 'completed', so the answer was never displayed.
    expect(result.current.status).toBe('round-ended');
    expect(result.current.revealedSong).toEqual(revealed);
    expect(result.current.sessionComplete).toBe(true);
  });

  it('moves to the summary on the next press, without refetching a finished challenge', async () => {
    api.submitArtistGuess.mockResolvedValue({
      correct: true,
      isFinal: true,
      song: revealed,
      songsCorrect: 5,
      currentRound: 9,
      sessionComplete: true,
      finalScore: { songsCorrect: 5, totalGuessesUsed: 55, timeTakenSeconds: 90, totalRounds: 10 },
    });

    const { result } = renderGame();
    await waitFor(() => expect(result.current.status).toBe('playing'));

    await act(async () => {
      await result.current.skip();
    });
    expect(result.current.status).toBe('round-ended');

    const loadsBefore = api.getArtistChallenge.mock.calls.length;
    await act(async () => {
      await result.current.nextRound();
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.finalScore?.songsCorrect).toBe(5);
    expect(api.getArtistChallenge).toHaveBeenCalledTimes(loadsBefore);
  });

  it('still advances to the next round mid-run', async () => {
    api.submitArtistGuess.mockResolvedValue({
      correct: true,
      isFinal: true,
      song: revealed,
      songsCorrect: 3,
      currentRound: 4,
      sessionComplete: false,
    });

    const { result } = renderGame();
    await waitFor(() => expect(result.current.status).toBe('playing'));

    await act(async () => {
      await result.current.skip();
    });
    expect(result.current.status).toBe('round-ended');
    expect(result.current.sessionComplete).toBe(false);

    await act(async () => {
      await result.current.nextRound();
    });

    // Mid-run the next round genuinely has to be fetched.
    expect(api.getArtistChallenge).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('playing');
  });
});

describe('useArtistGameState, selecting an artist', () => {
  it('does not force a new run, so an unfinished one is resumed', async () => {
    // Whether to resume is the server's call, and it resumes anything unfinished — that is what
    // stops a player rerolling a hard draw by leaving and coming back. Sending playAgain here
    // would override that and hand out a fresh set of songs on every visit.
    api.getArtistChallenge.mockResolvedValue({ ...challenge, currentRound: 0, songsCorrect: 0 });

    const { result } = renderGame();
    await waitFor(() => expect(result.current.status).toBe('playing'));

    expect(api.getArtistChallenge).toHaveBeenCalledTimes(1);
    const [artistId, includeFeatures, playAgain] = api.getArtistChallenge.mock.calls[0]!;
    expect(artistId).toBe(412);
    expect(includeFeatures).toBe(false);
    expect(playAgain).toBeFalsy();
  });

  it('drops straight into a new challenge when the previous run was completed', async () => {
    // Finishing a run must not strand the player on the results page. The server does this by
    // only resuming unfinished sessions, so the client asks for nothing special and simply
    // receives a challenge that isn't complete.
    api.getArtistChallenge.mockResolvedValue({ ...challenge, currentRound: 0, completed: false });

    const { result } = renderGame();
    await waitFor(() => expect(result.current.status).toBe('playing'));

    expect(result.current.status).not.toBe('completed');
  });

  it('loads the exact challenge behind a shared link instead of starting a new one', async () => {
    api.getArtistChallenge.mockResolvedValue({ ...challenge, currentRound: 0 });

    const { result } = renderHook(() => useArtistGameState(412, false, 'search', 77));
    await waitFor(() => expect(result.current.status).toBe('playing'));

    const [, , playAgain, , challengeId] = api.getArtistChallenge.mock.calls[0]!;
    expect(playAgain).toBe(false);
    expect(challengeId).toBe(77);
  });

  it('does not start a second challenge when the component re-renders', async () => {
    api.getArtistChallenge.mockResolvedValue({ ...challenge, currentRound: 0 });

    const { result, rerender } = renderGame();
    await waitFor(() => expect(result.current.status).toBe('playing'));

    rerender();
    rerender();

    // Each extra start would create and abandon another challenge server-side.
    expect(api.getArtistChallenge).toHaveBeenCalledTimes(1);
  });
});
