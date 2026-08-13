import { useCallback, useEffect, useState } from 'react';
import { getTodaysPuzzle, submitGuess } from '../../api/puzzle';
import type { PuzzleResponse, RevealedSong, SongSearchResult } from '../../types/api';

export type GameStatus = 'loading' | 'playing' | 'won' | 'lost' | 'error';

export interface GuessAttempt {
  song: SongSearchResult | null; // null represents a skip
  correct: boolean;
  /** Wrong song, but by the right artist — the only real narrowing hint the game can give. */
  sameArtist?: boolean;
}

interface GameState {
  status: GameStatus;
  puzzle: PuzzleResponse | null;
  attemptNumber: number; // 1-based, the attempt about to be made
  history: GuessAttempt[];
  revealedSong: RevealedSong | null;
  errorMessage: string | null;
  submitting: boolean;
  guess: (song: SongSearchResult) => Promise<void>;
  skip: () => Promise<void>;
}

export function useGameState(): GameState {
  const [status, setStatus] = useState<GameStatus>('loading');
  const [puzzle, setPuzzle] = useState<PuzzleResponse | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [history, setHistory] = useState<GuessAttempt[]>([]);
  const [revealedSong, setRevealedSong] = useState<RevealedSong | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const today = await getTodaysPuzzle();
        setPuzzle(today);
        if (today.completed) {
          setRevealedSong(today.song);
          setAttemptNumber(today.guessesUsed);
          setStatus(today.won ? 'won' : 'lost');
        } else {
          setStatus('playing');
        }
      } catch {
        setStatus('error');
        setErrorMessage("Couldn't load today's puzzle. Please try again.");
      }
    })();
  }, []);

  const submit = useCallback(
    async (song: SongSearchResult | null) => {
      if (status !== 'playing' || submitting) return;
      setSubmitting(true);
      setErrorMessage(null);

      try {
        // The daily puzzle's search always returns numeric `songs.id` values (unlike Artist
        // Mode, which uses string Deezer track ids) — SongSearchResult's `id` is a union to
        // support both call sites, so narrow it back down here.
        const result = await submitGuess({
          songId: song?.id as number | undefined,
          guessNumber: attemptNumber,
        });
        setHistory((prev) => [
          ...prev,
          { song, correct: result.correct, sameArtist: result.sameArtist },
        ]);

        if (result.isFinal) {
          setRevealedSong(result.song ?? null);
          setStatus(result.correct ? 'won' : 'lost');
        } else {
          setAttemptNumber((n) => n + 1);
        }
      } catch {
        setErrorMessage('Something went wrong submitting that. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [status, submitting, attemptNumber],
  );

  const guess = useCallback((song: SongSearchResult) => submit(song), [submit]);
  const skip = useCallback(() => submit(null), [submit]);

  return {
    status,
    puzzle,
    attemptNumber,
    history,
    revealedSong,
    errorMessage,
    submitting,
    guess,
    skip,
  };
}
