import { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import type { MultiplayerGameOver } from './useMultiplayerGame';
import { MultiplayerScoreboard } from './MultiplayerScoreboard';

interface MultiplayerResultsProps {
  gameOver: MultiplayerGameOver;
  selfId: string | null;
  label: string;
  canPlayAgain: boolean;
  onPlayAgain: () => void;
  onLeave: () => void;
}

export function MultiplayerResults({
  gameOver,
  selfId,
  label,
  canPlayAgain,
  onPlayAgain,
  onLeave,
}: MultiplayerResultsProps) {
  const iWon = gameOver.winner?.playerId === selfId;

  useEffect(() => {
    if (!iWon) return;
    void confetti({
      particleCount: 160,
      spread: 90,
      origin: { y: 0.3 },
      colors: ['#7c5cff', '#22d3ee', '#22c55e'],
    });
  }, [iWon]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center gap-4 sm:gap-6 px-4 py-4 sm:py-8">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass flex w-full flex-col items-center gap-4 rounded-2xl p-4 sm:p-6 text-center"
      >
        <h1 className="text-2xl font-extrabold text-white">Game over!</h1>
        {gameOver.winner ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-4xl">👑</p>
            <p className="text-xl font-bold text-chorusify-accent2">
              {gameOver.winner.displayName}
            </p>
            <p className="text-sm text-slate-400">
              wins the {label} race with {gameOver.winner.score} points
            </p>
            {iWon && <p className="text-sm font-semibold text-emerald-400">That&apos;s you! 🎉</p>}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No players finished.</p>
        )}
      </motion.div>

      <MultiplayerScoreboard
        scores={gameOver.scores}
        selfId={selfId}
        showMedals
        title="Final standings"
      />

      <div className="flex w-full max-w-xl flex-col gap-3">
        {canPlayAgain && (
          <button type="button" onClick={onPlayAgain} className="btn-primary w-full !rounded-xl">
            Play again (new songs)
          </button>
        )}
        <button type="button" onClick={onLeave} className="btn-ghost w-full !rounded-xl">
          Leave room
        </button>
      </div>
    </div>
  );
}
