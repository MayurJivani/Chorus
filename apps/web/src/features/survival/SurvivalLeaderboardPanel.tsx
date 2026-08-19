import { useEffect, useState } from 'react';
import { getSurvivalLeaderboard } from '../../api/survival';
import type { SurvivalLeaderboard } from '../../types/api';

/**
 * Longest streaks.
 *
 * Ranked on best run, unlike the artist and category boards. Those switched to totals because a
 * bad draw could be discarded and re-rolled; a survival run cannot be — a bad draw ends it. The
 * only way to a big number is to actually survive, so best-of is honest here.
 */
export function SurvivalLeaderboardPanel() {
  const [data, setData] = useState<SurvivalLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSurvivalLeaderboard()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="py-2 text-sm text-slate-400">Loading streaks…</p>;
  if (!data) return null;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
          Longest streaks
        </h3>
        {data.myBest > 0 && (
          <span className="font-mono text-xs text-purple-400">Your best: {data.myBest}</span>
        )}
      </div>

      {data.entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">
          No ranked streaks yet. Be the first!
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {data.entries.map((entry) => (
            <li
              key={entry.rank}
              className={
                'flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm transition-colors ' +
                (entry.isYou
                  ? 'border-white/20 bg-white/10 font-medium text-white shadow-sm'
                  : 'border-white/5 bg-white/[0.02] text-slate-300 hover:bg-white/[0.04]')
              }
            >
              <span className="truncate pr-2">
                #{entry.rank} {entry.displayName}
                {entry.isYou ? ' (you)' : ''}
              </span>
              <span className="flex shrink-0 items-center gap-2 font-mono text-xs font-semibold">
                <span className="text-purple-300">{entry.bestStreak}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-500">
                  {entry.runs} {entry.runs === 1 ? 'run' : 'runs'}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
