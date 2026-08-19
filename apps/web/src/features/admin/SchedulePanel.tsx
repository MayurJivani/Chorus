import { useCallback, useEffect, useState } from 'react';
import {
  getDailyPuzzles,
  searchAdminSongs,
  setDailyPuzzle,
  unscheduleDailyPuzzle,
  updateSongFlags,
} from '../../api/admin';
import type { AdminDailyPuzzle, AdminSong } from '../../types/api';

/**
 * The daily puzzle schedule.
 *
 * Controls that the server would reject — past dates, puzzles somebody has already finished —
 * are hidden rather than shown-and-refused, so the reason is visible up front. Hiding them is a
 * courtesy; the server enforces both rules regardless of what this page renders.
 */
export function SchedulePanel() {
  const [puzzles, setPuzzles] = useState<AdminDailyPuzzle[]>([]);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [newDate, setNewDate] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getDailyPuzzles();
      setPuzzles(list.puzzles);
      setToday(list.today);
    } catch {
      setError('Couldn’t load the schedule.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(successMessage);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work.');
    }
  };

  if (loading) return <p className="text-sm text-slate-400">Loading schedule…</p>;

  return (
    <div className="flex flex-col gap-6">
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

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
          Schedule a date
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={newDate}
            min={today}
            onChange={(e) => setNewDate(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            disabled={!newDate}
            onClick={() => setEditingDate(newDate)}
            className="btn-secondary !py-2 text-sm disabled:opacity-40"
          >
            Choose a song
          </button>
        </div>
        {editingDate === newDate && newDate && (
          <SongPicker
            heading={`Song for ${newDate}`}
            onCancel={() => setEditingDate(null)}
            onPick={(song) =>
              run(
                () => setDailyPuzzle(newDate, song.id),
                `${newDate} is now “${song.title}” by ${song.artist}.`,
              ).then(() => setEditingDate(null))
            }
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
          Scheduled puzzles
        </h2>

        {puzzles.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nothing scheduled yet. The picker fills each day in the first time someone opens it.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {puzzles.map((puzzle) => {
              const locked = puzzle.plays > 0 || puzzle.puzzleDate < today;
              return (
                <li
                  key={puzzle.id}
                  className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-slate-500">
                        {puzzle.puzzleDate}
                        {puzzle.puzzleDate === today && (
                          <span className="ml-2 rounded-full bg-chorus-accent/20 px-2 py-0.5 text-[10px] font-semibold text-chorus-accent">
                            today
                          </span>
                        )}
                      </p>
                      <p className="truncate font-semibold text-white">{puzzle.title}</p>
                      <p className="truncate text-xs text-slate-400">{puzzle.artist}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-xs text-slate-500">
                        {puzzle.plays} {puzzle.plays === 1 ? 'play' : 'plays'}
                      </span>
                      {locked ? (
                        <span className="text-xs text-slate-600">
                          {puzzle.plays > 0 ? 'played, locked' : 'past'}
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingDate(
                                editingDate === puzzle.puzzleDate ? null : puzzle.puzzleDate,
                              )
                            }
                            className="btn-ghost !py-1 text-xs"
                          >
                            Change song
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void run(
                                () => unscheduleDailyPuzzle(puzzle.puzzleDate),
                                `${puzzle.puzzleDate} unscheduled. It will be re-picked automatically.`,
                              )
                            }
                            className="btn-ghost !py-1 text-xs text-red-300 hover:text-red-200"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {!puzzle.manualOverride && (
                    <button
                      type="button"
                      onClick={() =>
                        void run(
                          () => updateSongFlags(puzzle.songId, { manualOverride: true }),
                          `“${puzzle.title}” added to the curated pool.`,
                        )
                      }
                      className="self-start text-xs text-slate-500 underline decoration-dotted hover:text-slate-300"
                    >
                      Not in the curated pool, add it
                    </button>
                  )}

                  {editingDate === puzzle.puzzleDate && !locked && (
                    <SongPicker
                      heading={`Replace the song for ${puzzle.puzzleDate}`}
                      onCancel={() => setEditingDate(null)}
                      onPick={(song) =>
                        run(
                          () => setDailyPuzzle(puzzle.puzzleDate, song.id),
                          `${puzzle.puzzleDate} is now “${song.title}” by ${song.artist}.`,
                        ).then(() => setEditingDate(null))
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function SongPicker({
  heading,
  onPick,
  onCancel,
}: {
  heading: string;
  onPick: (song: AdminSong) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminSong[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setSearching(true);
    // Debounced so typing a title doesn't fire a query per keystroke.
    const timer = setTimeout(() => {
      searchAdminSongs(query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{heading}</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-white"
        >
          Cancel
        </button>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the song bank by title or artist"
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500"
      />
      {searching && <p className="text-xs text-slate-500">Searching…</p>}
      {!searching && results.length === 0 && (
        <p className="text-xs text-slate-500">No songs matched.</p>
      )}
      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {results.map((song) => (
          <li key={song.id}>
            <button
              type="button"
              disabled={!song.active}
              onClick={() => onPick(song)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white disabled:opacity-40"
            >
              <span className="min-w-0 truncate">
                {song.title} <span className="text-slate-500">by {song.artist}</span>
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-500">
                {!song.active ? 'inactive' : song.manualOverride ? 'curated' : 'chart'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
