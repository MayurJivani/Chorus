import type { ReactNode } from 'react';
import { useGameState } from '../features/game/useGameState';
import { SnippetPlayer } from '../features/game/SnippetPlayer';
import { SnippetProgressBar } from '../features/game/SnippetProgressBar';
import { AttemptPips } from '../features/game/AttemptPips';
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

  if (status === 'loading') {
    return <Centered>Loading today&apos;s puzzle…</Centered>;
  }

  if (status === 'error' || !puzzle) {
    return <Centered>{errorMessage ?? 'Something went wrong.'}</Centered>;
  }

  const isOver = status === 'won' || status === 'lost';
  const previewUrl = puzzle.completed ? null : puzzle.previewUrl;
  const stageSeconds =
    SNIPPET_SCHEDULE_SECONDS[Math.min(attemptNumber, SNIPPET_SCHEDULE_SECONDS.length) - 1] ?? 1;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-57px)] max-w-xl flex-col items-center justify-center gap-6 px-4 py-12">
      {/* Glass card wrapping the game */}
      <div className="glass w-full rounded-2xl p-6 flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold text-white">Daily Puzzle</h1>
          <p className="text-xs text-slate-500 font-mono">{puzzle.puzzleDate}</p>
        </div>

        <SnippetProgressBar attemptNumber={attemptNumber} />

        {previewUrl && !isOver && (
          <SnippetPlayer
            previewUrl={previewUrl}
            stageSeconds={stageSeconds}
            disabled={submitting}
          />
        )}

        <AttemptPips history={history} />

        {!isOver && <GuessInput onGuess={guess} onSkip={skip} disabled={submitting} />}

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
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center text-slate-300">
      {children}
    </div>
  );
}
