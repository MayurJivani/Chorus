import { motion } from 'framer-motion';
import type { GuessAttempt } from './useGameState';
import { MAX_GUESSES } from '../../types/api';

interface AttemptPipsProps {
  history: GuessAttempt[];
}

export function AttemptPips({ history }: AttemptPipsProps) {
  return (
    <div className="flex gap-3">
      {Array.from({ length: MAX_GUESSES }, (_, i) => {
        const attempt = history[i];
        const state = !attempt ? 'pending' : attempt.correct ? 'correct' : 'wrong';

        return (
          <motion.span
            key={i}
            animate={state === 'wrong' ? { x: [0, -6, 6, -4, 4, 0] } : {}}
            transition={{ duration: 0.35 }}
            className={
              'h-4 w-4 rounded-full border-2 transition-all duration-300 ' +
              (state === 'correct'
                ? 'border-chorus-success bg-chorus-success shadow-[0_0_8px_#22c55eaa]'
                : state === 'wrong'
                  ? 'border-chorus-danger bg-chorus-danger shadow-[0_0_8px_#ef4444aa]'
                  : 'border-slate-700 bg-transparent')
            }
          />
        );
      })}
    </div>
  );
}
