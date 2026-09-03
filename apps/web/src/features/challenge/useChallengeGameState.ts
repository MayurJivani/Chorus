import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ArtistChallengeResponse,
  ArtistGuessResult,
  RevealedSong,
  SongSearchResult,
} from '../../types/api';
import type { GuessAttempt } from '../game/useGameState';
import { useGameConfig } from '../../hooks/useGameConfig';

export interface RunSongEntry {
  song: RevealedSong;
  correct: boolean;
  previewUrl?: string;
}

export type ChallengeGameStatus = 'loading' | 'playing' | 'round-ended' | 'completed' | 'error';

export interface ChallengeGuessInput {
  deezerTrackId?: string;
  guessNumber: number;
  guessMode?: 'search' | 'choice';
}

/**
 * Where a run's rounds come from.
 *
 * Artist Mode and Category Mode play by identical rules and differ only in which endpoints
 * they talk to, so the state machine below takes the endpoints as data. `key` identifies the
 * selection — when it changes, a new run is started.
 */
export interface ChallengeEndpoints {
  key: string;
  load: (
    playAgain: boolean | undefined,
    mode: 'search' | 'choice',
    challengeId: number | undefined,
  ) => Promise<ArtistChallengeResponse>;
  guess: (input: ChallengeGuessInput) => Promise<ArtistGuessResult>;
  /** Message shown if the run can't be loaded at all. */
  loadErrorMessage: string;
}

export interface ChallengeGameState {
  status: ChallengeGameStatus;
  challenge: ArtistChallengeResponse | null;
  attemptNumber: number;
  roundHistory: GuessAttempt[];
  revealedSong: RevealedSong | null;
  finalScore: ArtistGuessResult['finalScore'] | null;
  /** The run is over and the on-screen reveal is its last round. */
  sessionComplete: boolean;
  /** One entry per song answered in this run, in order — what the share grid is drawn from.
   *  `roundHistory` cannot serve: it is the attempts within the *current* song and resets. */
  runHistory: boolean[];
  /** Every song revealed during the run, with its result. */
  revealedSongs: RunSongEntry[];
  errorMessage: string | null;
  submitting: boolean;
  guess: (song: SongSearchResult) => Promise<void>;
  skip: () => Promise<void>;
  nextRound: () => Promise<void>;
  playAgain: () => Promise<void>;
}

export function useChallengeGameState(
  endpoints: ChallengeEndpoints,
  guessMode: 'search' | 'choice',
  sharedChallengeId?: number,
): ChallengeGameState {
  const { maxGuesses } = useGameConfig();
  const [status, setStatus] = useState<ChallengeGameStatus>('loading');
  const [challenge, setChallenge] = useState<ArtistChallengeResponse | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [roundHistory, setRoundHistory] = useState<GuessAttempt[]>([]);
  const [runHistory, setRunHistory] = useState<boolean[]>([]);
  const [revealedSongs, setRevealedSongs] = useState<RunSongEntry[]>([]);
  const [revealedSong, setRevealedSong] = useState<RevealedSong | null>(null);
  const [finalScore, setFinalScore] = useState<ArtistGuessResult['finalScore'] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // True once the tenth round has been answered but its reveal is still on screen.
  const [sessionComplete, setSessionComplete] = useState(false);

  // Held in a ref so `loadCurrentRound` doesn't change identity on every render just because
  // the caller built a fresh endpoints object — the run-start effect below keys off `key`.
  const endpointsRef = useRef(endpoints);
  endpointsRef.current = endpoints;

  const currentPreviewUrl = useRef<string | undefined>(undefined);
  if (challenge && !challenge.completed) {
    currentPreviewUrl.current = challenge.previewUrl;
  }

  const loadCurrentRound = useCallback(
    async (playAgain?: boolean, startingNewRun = false) => {
      const api = endpointsRef.current;
      try {
        // If playAgain is true, we start a new randomized session instead of the shared challenge
        const cid = playAgain ? undefined : sharedChallengeId;
        const current = await api.load(playAgain, guessMode, cid);
        setChallenge(current);
        setAttemptNumber(1);
        setRoundHistory([]);
        // Only cleared when a run begins — advancing to the next song must keep the record of
        // the songs already answered, which is the whole point of it.
        if (startingNewRun || playAgain) {
          setRunHistory([]);
          setRevealedSongs([]);
        }
        setRevealedSong(null);
        setSessionComplete(false);
        setStatus(current.completed ? 'completed' : 'playing');
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : api.loadErrorMessage);
      }
    },
    [guessMode, sharedChallengeId],
  );

  // Which selection has already been started, so a fresh run is begun once per selection rather
  // than on every render. A ref rather than state because StrictMode invokes this effect twice
  // in development, and without the guard each visit would create (and abandon) a second
  // challenge.
  const startedSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    const selection = `${endpoints.key}:${guessMode}:${sharedChallengeId ?? ''}`;
    if (startedSelectionRef.current === selection) return;
    startedSelectionRef.current = selection;

    void loadCurrentRound(false, true);
  }, [endpoints.key, guessMode, sharedChallengeId, loadCurrentRound]);

  const submit = useCallback(
    async (song: SongSearchResult | null) => {
      if (status !== 'playing' || submitting) return;
      setSubmitting(true);
      setErrorMessage(null);

      try {
        // Challenges identify tracks by their Deezer track id (a string) rather than the daily
        // puzzle's numeric songs.id — SongSearchResult's `id` is a union to support both call
        // sites, so narrow it back down here.
        const result = await endpointsRef.current.guess({
          deezerTrackId: song?.id as string | undefined,
          /*
           * A skip spends the whole round, so it reports the *last* attempt rather than the
           * one the player is on — that is what makes the server treat it as final and reveal
           * the answer.
           *
           * This used to be a hardcoded 6, from when the snippet schedule had six stages. The
           * schedule is an admin setting and its default is now five, and the server rejects
           * any guess number past the end of it — so every Skip in Artist and Category mode
           * was answering "Something went wrong submitting that". Reading the live length
           * keeps it correct whatever the setting is changed to.
           */
          guessNumber: song === null ? maxGuesses : attemptNumber,
          guessMode,
        });
        setRoundHistory((prev) => [...prev, { song, correct: result.correct }]);

        if (result.isFinal) {
          setRevealedSong(result.song ?? null);
          setRunHistory((prev) => [...prev, result.correct]);
          if (result.song) {
            setRevealedSongs((prev) => [
              ...prev,
              {
                song: result.song!,
                correct: result.correct,
                previewUrl: currentPreviewUrl.current,
              },
            ]);
          }
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
        setErrorMessage('Something went wrong submitting that. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [status, submitting, attemptNumber, guessMode, maxGuesses],
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
    runHistory,
    revealedSongs,
    errorMessage,
    submitting,
    guess,
    skip,
    nextRound,
    playAgain,
  };
}
