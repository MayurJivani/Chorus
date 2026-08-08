import { AnimatePresence, motion } from 'framer-motion';
import type { GuessAttempt } from './useGameState';

interface GuessHistoryProps {
  history: GuessAttempt[];
}

/**
 * The guesses already spent, most recent first.
 *
 * Previously the only record of a guess was a coloured dot, so a player four attempts in had
 * no way to recall what they had already tried and could burn a turn repeating themselves.
 * Listing them also gives the "right artist" hint somewhere to live: it stays on screen for
 * the rest of the puzzle instead of flashing past.
 */
export function GuessHistory({ history }: GuessHistoryProps) {
  if (history.length === 0) return null;

  return (
    // Capped and independently scrollable: the page deliberately fits the viewport without
    // scrolling, so a growing list of guesses must not be what pushes the input off-screen.
    <ul
      className="flex max-h-32 w-full flex-col gap-1.5 overflow-y-auto sm:max-h-44"
      aria-label="Your guesses so far"
    >
      <AnimatePresence initial={false}>
        {history
          .map((attempt, index) => ({ attempt, index }))
          .reverse()
          .map(({ attempt, index }) => {
            const skipped = attempt.song === null;
            const tone = attempt.correct
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : attempt.sameArtist
                ? 'border-amber-500/40 bg-amber-500/10'
                : skipped
                  ? 'border-white/10 bg-white/[0.03]'
                  : 'border-red-500/30 bg-red-500/[0.07]';

            return (
              <motion.li
                key={index}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${tone}`}
              >
                <span
                  className="w-4 shrink-0 text-center text-xs font-mono text-slate-500"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>

                {skipped ? (
                  <span className="flex-1 truncate italic text-slate-500">Skipped</span>
                ) : (
                  <span className="flex-1 truncate text-slate-200">
                    {attempt.song?.title}
                    <span className="text-slate-500"> — {attempt.song?.artist}</span>
                  </span>
                )}

                {attempt.correct ? (
                  <span className="shrink-0 text-xs font-semibold text-emerald-400">Correct</span>
                ) : attempt.sameArtist ? (
                  <span className="shrink-0 text-xs font-semibold text-amber-400">
                    Right artist
                  </span>
                ) : null}
              </motion.li>
            );
          })}
      </AnimatePresence>
    </ul>
  );
}
