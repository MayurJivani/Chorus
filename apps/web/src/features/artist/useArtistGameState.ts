import { useCallback, useEffect, useState } from 'react';
import { getArtistChallenge, submitArtistGuess } from '../../api/artists';
import type {
  ArtistChallengeResponse,
  ArtistGuessResult,
  RevealedSong,
  SongSearchResult,
} from '../../types/api';
import type { GuessAttempt } from '../game/useGameState';

export type ArtistGameStatus = 'loading' | 'playing' | 'round-ended' | 'completed' | 'error';

interface ArtistGameState {
  status: ArtistGameStatus;
  challenge: ArtistChallengeResponse | null;
  attemptNumber: number;
  roundHistory: GuessAttempt[];
  revealedSong: RevealedSong | null;
  finalScore: ArtistGuessResult['finalScore'] | null;
  /** The run is over and the on-screen reveal is its last round. */
  sessionComplete: boolean;
  errorMessage: string | null;
  submitting: boolean;
  guess: (song: SongSearchResult) => Promise<void>;
  skip: () => Promise<void>;
  nextRound: () => Promise<void>;
  playAgain: () => Promise<void>;
}

export function useArtistGameState(
  artistId: number,
  includeFeatures: boolean,
  guessMode: 'search' | 'choice',
  sharedChallengeId?: number,
): ArtistGameState {
  const [status, setStatus] = useState<ArtistGameStatus>('loading');
  const [challenge, setChallenge] = useState<ArtistChallengeResponse | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [roundHistory, setRoundHistory] = useState<GuessAttempt[]>([]);
  const [revealedSong, setRevealedSong] = useState<RevealedSong | null>(null);
  const [finalScore, setFinalScore] = useState<ArtistGuessResult['finalScore'] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // True once the tenth round has been answered but its reveal is still on screen.
  const [sessionComplete, setSessionComplete] = useState(false);

  const loadCurrentRound = useCallback(
    async (playAgain?: boolean) => {
      try {
        // If playAgain is true, we start a new randomized session instead of the shared challenge
        const cid = playAgain ? undefined : sharedChallengeId;
        const current = await getArtistChallenge(
          artistId,
          includeFeatures,
          playAgain,
          guessMode,
          cid,
        );
        setChallenge(current);
        setAttemptNumber(1);
        setRoundHistory([]);
        setRevealedSong(null);
        setSessionComplete(false);
        setStatus(current.completed ? 'completed' : 'playing');
      } catch (err) {
        setStatus('error');
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Couldn't load this artist's challenge. Please try again.",
        );
      }
    },
    [artistId, includeFeatures, guessMode, sharedChallengeId],
  );

  useEffect(() => {
    void loadCurrentRound();
  }, [loadCurrentRound]);

  const submit = useCallback(
    async (song: SongSearchResult | null) => {
      if (status !== 'playing' || submitting) return;
      setSubmitting(true);
      setErrorMessage(null);

      try {
        // Artist Mode identifies tracks by their Deezer track id (a string) rather than the
        // daily puzzle's numeric songs.id — SongSearchResult's `id` is a union to support
        // both call sites, so narrow it back down here.
        const result = await submitArtistGuess(
          artistId,
          {
            deezerTrackId: song?.id as string | undefined,
            guessNumber: attemptNumber,
            guessMode,
          },
          includeFeatures,
        );
        setRoundHistory((prev) => [...prev, { song, correct: result.correct }]);

        if (result.isFinal) {
          setRevealedSong(result.song ?? null);
          // Patch challenge with the latest server-reported counts so the UI stays in sync.
          if (result.songsCorrect != null) {
            setChallenge((prev) =>
              prev
                ? {
                    ...prev,
                    songsCorrect: result.songsCorrect!,
                    currentRound: result.currentRound ?? prev.currentRound,
                  }
                : prev,
            );
          }
          // The final round gets the same reveal as every other one. It used to jump straight
          // to the summary, so the tenth song's answer was the only one a player never saw —
          // most obviously when they skipped it, which is exactly when they want to know.
          // The summary is now one button press away instead of automatic.
          if (result.sessionComplete) {
            setFinalScore(result.finalScore ?? null);
            setSessionComplete(true);
          }
          setStatus('round-ended');
        } else {
          setAttemptNumber((n) => n + 1);
        }
      } catch {
        setErrorMessage('Something went wrong submitting that — please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [status, submitting, attemptNumber, artistId, includeFeatures, guessMode],
  );

  const guess = useCallback((song: SongSearchResult) => submit(song), [submit]);
  const skip = useCallback(() => submit(null), [submit]);
  const nextRound = useCallback(async () => {
    // After the last round the reveal is the only thing left to dismiss — there is no next
    // round to fetch, so move to the summary rather than re-requesting a finished challenge.
    if (sessionComplete) {
      setStatus('completed');
      return;
    }
    await loadCurrentRound();
  }, [sessionComplete, loadCurrentRound]);
  const playAgain = useCallback(() => loadCurrentRound(true), [loadCurrentRound]);

  return {
    status,
    challenge,
    attemptNumber,
    roundHistory,
    revealedSong,
    finalScore,
    sessionComplete,
    errorMessage,
    submitting,
    guess,
    skip,
    nextRound,
    playAgain,
  };
}
