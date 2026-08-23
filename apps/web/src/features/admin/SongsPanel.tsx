import { useCallback, useEffect, useState } from 'react';
import { searchAdminSongs, updateSongFlags } from '../../api/admin';
import type { AdminSong } from '../../types/api';

export function SongsPanel() {
  const [songs, setSongs] = useState<AdminSong[]>([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await searchAdminSongs(search);
      setSongs(results);
    } catch {
      setError('Could not load songs.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const doSearch = () => setSearch(query);

  const toggle = async (songId: number, field: 'active' | 'manualOverride', current: boolean) => {
    setError(null);
    setNotice(null);
    try {
      const { song } = await updateSongFlags(songId, { [field]: !current });
      setSongs((prev) => prev.map((s) => (s.id === song.id ? song : s)));
      const label =
        field === 'active'
          ? song.active
            ? 'activated'
            : 'deactivated'
          : song.manualOverride
            ? 'curated'
            : 'uncurated';
      setNotice(`"${song.title}" ${label}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update song.');
    }
  };

  const curated = songs.filter((s) => s.manualOverride && s.active).length;
  const active = songs.filter((s) => s.active).length;

  return (
    <div className="flex flex-col gap-4">
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          doSearch();
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or artist…"
          className="w-full min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-white/20"
        />
        <button type="submit" className="btn-secondary shrink-0 !py-2 text-sm">
          Search
        </button>
      </form>

      <p className="text-xs text-slate-500">
        {songs.length} songs shown · {active} active · {curated} curated
        {search ? ` · matching "${search}"` : ''}
      </p>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : songs.length === 0 ? (
        <p className="text-sm text-slate-400">No songs found.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {songs.map((song) => (
            <li
              key={song.id}
              className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${
                song.active
                  ? 'border-white/5 bg-white/[0.02]'
                  : 'border-red-500/10 bg-red-500/[0.03]'
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                {song.albumArtUrl ? (
                  <img
                    src={song.albumArtUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm">
                    ???
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {song.title}
                    {song.manualOverride && (
                      <span className="ml-2 rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-purple-300">
                        curated
                      </span>
                    )}
                    {!song.active && (
                      <span className="ml-2 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-300">
                        inactive
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-500">{song.artist}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggle(song.id, 'manualOverride', song.manualOverride)}
                  className={`btn-ghost !py-1 text-xs ${
                    song.manualOverride
                      ? 'text-slate-400 hover:text-slate-300'
                      : 'text-purple-300 hover:text-purple-200'
                  }`}
                >
                  {song.manualOverride ? 'Uncurate' : 'Curate'}
                </button>
                <button
                  type="button"
                  onClick={() => void toggle(song.id, 'active', song.active)}
                  className={`btn-ghost !py-1 text-xs ${
                    song.active
                      ? 'text-red-300 hover:text-red-200'
                      : 'text-emerald-300 hover:text-emerald-200'
                  }`}
                >
                  {song.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
