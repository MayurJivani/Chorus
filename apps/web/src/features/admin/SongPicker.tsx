import { useEffect, useState } from 'react';
import { searchAdminSongs } from '../../api/admin';
import type { AdminSong } from '../../types/api';

/**
 * Search-and-choose over the song bank.
 *
 * Shared by the schedule and the upcoming projection, which both need exactly this and would
 * otherwise keep two copies in step by hand.
 */
export function SongPicker({
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
