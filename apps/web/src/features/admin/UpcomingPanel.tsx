import { useCallback, useEffect, useState } from 'react';
import { getUpcomingSchedule, randomizeDailyPuzzle, setDailyPuzzle } from '../../api/admin';
import { SongPicker } from './SongPicker';
import type { UpcomingDay } from '../../types/api';

/**
 * What the next two weeks will play.
 *
 * The picker is deterministic, so upcoming days can be projected rather than created: asking the
 * database would show nothing, because a day has no row until somebody opens it. A projected day
 * is marked as such — it is what *would* be chosen, and stays free to change until it is either
 * played or pinned here.
 */
export function UpcomingPanel() {
  const [days, setDays] = useState<UpcomingDay[]>([]);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const schedule = await getUpcomingSchedule(14);
      setDays(schedule.days);
      setToday(schedule.today);
    } catch {
      setError('Couldn’t load the upcoming schedule.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (date: string, action: () => Promise<unknown>, message: string) => {
    setBusyDate(date);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work.');
    } finally {
      setBusyDate(null);
    }
  };

  if (loading) return <p className="text-sm text-slate-400">Loading upcoming days…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Coming up</h3>
        <p className="text-xs text-slate-500">
          Projected from the automatic picker. Shuffle or set a day to pin it.
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {notice}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {days.map((day) => (
          <li
            key={day.puzzleDate}
            className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-mono text-xs text-slate-500">
                  {day.puzzleDate}
                  {day.puzzleDate === today && (
                    <span className="rounded-full bg-chorusify-accent/20 px-2 py-0.5 text-[10px] font-semibold text-chorusify-accent">
                      today
                    </span>
                  )}
                  <span
                    className={
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
                      (day.scheduled
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-white/5 text-slate-500')
                    }
                  >
                    {day.scheduled ? 'set' : 'projected'}
                  </span>
                </p>
                <p className="truncate font-semibold text-white">
                  {day.song ? day.song.title : 'No song available'}
                </p>
                {day.song && <p className="truncate text-xs text-slate-400">{day.song.artist}</p>}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={busyDate === day.puzzleDate}
                  onClick={() =>
                    void run(
                      day.puzzleDate,
                      () => randomizeDailyPuzzle(day.puzzleDate),
                      `${day.puzzleDate} shuffled onto a new song.`,
                    )
                  }
                  className="btn-ghost !py-1 text-xs disabled:opacity-40"
                >
                  {busyDate === day.puzzleDate ? 'Shuffling…' : 'Shuffle'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditingDate(editingDate === day.puzzleDate ? null : day.puzzleDate)
                  }
                  className="btn-ghost !py-1 text-xs"
                >
                  Pick
                </button>
              </div>
            </div>

            {editingDate === day.puzzleDate && (
              <SongPicker
                heading={`Song for ${day.puzzleDate}`}
                onCancel={() => setEditingDate(null)}
                onPick={(song) =>
                  void run(
                    day.puzzleDate,
                    () => setDailyPuzzle(day.puzzleDate, song.id),
                    `${day.puzzleDate} is now “${song.title}”.`,
                  ).then(() => setEditingDate(null))
                }
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
