import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGameState } from '../features/game/useGameState';
import { SnippetPlayer } from '../features/game/SnippetPlayer';
import { SnippetProgressBar } from '../features/game/SnippetProgressBar';
import { AttemptPips } from '../features/game/AttemptPips';
import { GuessHistory } from '../features/game/GuessHistory';
import { GuessInput } from '../features/game/GuessInput';
import { WinLoseOverlay } from '../features/game/WinLoseOverlay';
import { SNIPPET_SCHEDULE_SECONDS } from '../types/api';

export function PlayPage() {
  const {
    status,
    puzzle,
    attemptNumber,
    history,
    revealedSong,
    errorMessage,
    submitting,
    guess,
    skip,
  } = useGameState();

  const [guessFeedback, setGuessFeedback] = useState<'correct' | 'wrong' | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevHistoryLen = useRef(history.length);

  useEffect(() => {
    if (history.length > prevHistoryLen.current) {
      const last = history[history.length - 1];
      if (last && !last.correct) {
        setGuessFeedback('wrong');
      } else if (last && last.correct) {
        setGuessFeedback('correct');
      }
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setGuessFeedback(null), 800);
    }
    prevHistoryLen.current = history.length;
  }, [history]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  if (status === 'loading') {
    return <Centered>Loading today&apos;s puzzle…</Centered>;
  }

  if (status === 'error' || !puzzle) {
    return <Centered>{errorMessage ?? 'Something went wrong.'}</Centered>;
  }

  const isOver = status === 'won' || status === 'lost';
  const lastAttempt = history[history.length - 1];
  const previewUrl = puzzle.completed ? null : puzzle.previewUrl;
  const stageSeconds =
    SNIPPET_SCHEDULE_SECONDS[Math.min(attemptNumber, SNIPPET_SCHEDULE_SECONDS.length) - 1] ?? 1;

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-6 px-4 py-4 sm:py-12">
      {/* Glass card wrapping the game. Padding and gaps tighten on small screens so the whole
          game — record, transport, pips, input and guess list — still fits a phone viewport
          without the page scrolling. */}
      <div className="glass w-full rounded-2xl p-4 sm:p-6 flex flex-col items-center gap-3 sm:gap-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold text-white">Daily Challenge</h1>
          <p className="text-xs text-slate-500 font-mono">{puzzle.puzzleDate}</p>
        </div>

        <SnippetProgressBar stageIndex={attemptNumber - 1} />

        {previewUrl && !isOver && (
          <SnippetPlayer
            previewUrl={previewUrl}
            stageSeconds={stageSeconds}
            disabled={submitting}
          />
        )}

        <AttemptPips history={history} />

        {!isOver && lastAttempt?.sameArtist && (
          <p className="text-sm font-semibold text-amber-400" role="status">
            Right artist, wrong song. Keep going.
          </p>
        )}

        {!isOver && (
          <GuessInput
            onGuess={guess}
            onSkip={skip}
            disabled={submitting}
            guessFeedback={guessFeedback}
          />
        )}

        {!isOver && <GuessHistory history={history} />}

        {errorMessage && <p className="text-sm text-chorus-danger">{errorMessage}</p>}
      </div>

      {isOver && revealedSong && (
        <WinLoseOverlay
          won={status === 'won'}
          song={revealedSong}
          history={history}
          puzzleDate={puzzle.puzzleDate}
        />
      )}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center text-slate-300">{children}</div>
  );
}
