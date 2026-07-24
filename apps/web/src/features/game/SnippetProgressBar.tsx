import { motion } from 'framer-motion';
import { SNIPPET_SCHEDULE_SECONDS } from '../../types/api';

interface SnippetProgressBarProps {
  attemptNumber: number; // 1-based
}

export function SnippetProgressBar({ attemptNumber }: SnippetProgressBarProps) {
  const maxSeconds = SNIPPET_SCHEDULE_SECONDS[SNIPPET_SCHEDULE_SECONDS.length - 1] ?? 1;
  const currentSeconds =
    SNIPPET_SCHEDULE_SECONDS[Math.min(attemptNumber, SNIPPET_SCHEDULE_SECONDS.length) - 1] ?? 0;

  return (
    <div className="w-full max-w-md">
      {/* Track */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-chorus-surface/80">
        <motion.div
          className="h-full rounded-full bg-chorus-gradient shadow-[0_0_8px_#7c5cffaa]"
          initial={{ width: 0 }}
          animate={{ width: `${(currentSeconds / maxSeconds) * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Milestone dots + labels */}
      <div className="mt-2.5 flex justify-between">
        {SNIPPET_SCHEDULE_SECONDS.map((seconds, i) => {
          const reached = i + 1 <= attemptNumber;
          return (
            <div key={seconds} className="flex flex-col items-center gap-1">
              <span
                className={
                  'h-1.5 w-1.5 rounded-full transition-colors duration-300 ' +
                  (reached ? 'bg-chorus-accent2 shadow-[0_0_4px_#22d3ee99]' : 'bg-slate-700')
                }
              />
              <span
                className={`text-[10px] font-mono transition-colors duration-300 ${reached ? 'text-chorus-accent2' : 'text-slate-600'}`}
              >
                {seconds}s
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
