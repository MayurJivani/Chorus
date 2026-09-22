import { useEffect, useState } from 'react';
import { getAdminActivity } from '../../api/admin';
import { VinylSpinner } from '../easter-eggs/VinylSpinner';
import type { AdminActivity } from '../../types/api';

/**
 * Who played what, and how many people turned up.
 *
 * The overview answers "how much is happening" with counters. This answers "what happened",
 * which is the question you actually act on: a run of completions against one category says it
 * landed, a column of abandoned runs against another says it is too hard, too obscure, or
 * broken.
 *
 * Visitors come from sessions rather than accounts, because almost nobody registers to try a
 * guessing game once. Counting users would report a fraction of the real traffic.
 */
export function ActivityPanel() {
  const [data, setData] = useState<AdminActivity | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getAdminActivity(50)
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="text-sm text-chorusify-danger">Couldn't load activity.</p>;
  if (!data) return <VinylSpinner size={28} text="Loading activity…" />;

  const v = data.visitors;

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Visitors 24h" value={v.visitors24h} />
        <Stat label="Visitors 7d" value={v.visitors7d} />
        <Stat label="Visitors 30d" value={v.visitors30d} />
        <Stat label="Signed in 7d" value={v.signedIn7d} />
        <Stat label="Sessions all time" value={v.sessionsTotal} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Most played this week
        </h3>
        {data.byCategory.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing played in the last seven days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-3 font-medium">Source</th>
                  <th className="py-1 pr-3 font-medium">Runs</th>
                  <th className="py-1 pr-3 font-medium">Finished</th>
                  <th className="py-1 font-medium">Avg correct</th>
                </tr>
              </thead>
              <tbody>
                {data.byCategory.map((row) => (
                  <tr key={row.source + row.sourceType} className="border-t border-white/5">
                    <td className="py-1.5 pr-3">
                      <span className="text-slate-200">{row.source}</span>
                      <span className="ml-1.5 text-[10px] uppercase text-slate-600">
                        {row.sourceType}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-slate-300">{row.runs}</td>
                    {/* The completion rate is the signal; the raw count on its own hides a
                        category everyone starts and nobody finishes. */}
                    <td className="py-1.5 pr-3 text-slate-400">
                      {row.completed}
                      <span className="ml-1 text-[11px] text-slate-600">
                        ({Math.round((row.completed / Math.max(row.runs, 1)) * 100)}%)
                      </span>
                    </td>
                    <td className="py-1.5 text-slate-400">{row.avgCorrect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Recent runs
        </h3>
        {data.recent.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody has played yet.</p>
        ) : (
          <ol className="text-sm">
            {data.recent.map((run) => (
              <li
                key={run.id}
                className="flex items-baseline gap-2 border-b border-white/5 py-1.5 last:border-0"
              >
                <span
                  className={
                    'w-28 shrink-0 truncate ' + (run.isUser ? 'text-slate-200' : 'text-slate-500')
                  }
                >
                  {run.player}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-400">{run.source}</span>
                <span className="shrink-0 text-slate-300">
                  {run.correct}/{run.rounds}
                </span>
                <span
                  className={
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ' +
                    (run.completed
                      ? 'bg-emerald-400/10 text-emerald-300'
                      : 'bg-white/5 text-slate-500')
                  }
                >
                  {run.completed ? 'done' : 'left'}
                </span>
                <span className="w-24 shrink-0 text-right text-[11px] text-slate-600">
                  {new Date(run.at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
      <span className="block text-lg font-bold text-white">{value ?? 0}</span>
      <span className="block text-[11px] text-slate-500">{label}</span>
    </div>
  );
}
