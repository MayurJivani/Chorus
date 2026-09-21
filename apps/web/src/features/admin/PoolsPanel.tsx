import { useEffect, useState } from 'react';
import { getAdminPools, getAdminPoolTracks } from '../../api/admin';
import { VinylSpinner } from '../easter-eggs/VinylSpinner';
import type { AdminPool, AdminPoolTracks } from '../../types/api';

/**
 * What is actually inside every category and collection.
 *
 * This is the browse view the player-facing app deliberately does not have: seeing the track
 * list is seeing the answers, which would spoil the game. Behind the admin gate that stops
 * being a leak and starts being the only way to check whether a collection is any good.
 *
 * It reads stored pools, so a category nobody has played yet shows as not built rather than
 * triggering a rebuild - see the route for why that matters with 900-album collections.
 */
export function PoolsPanel() {
  const [pools, setPools] = useState<AdminPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminPoolTracks | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    getAdminPools()
      .then((res) => setPools(res.pools))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const open = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    setDetailError(null);
    setFilter('');
    try {
      setDetail(await getAdminPoolTracks(id));
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Could not load that pool');
    }
  };

  if (loading) return <VinylSpinner size={28} text="Loading pools…" />;
  if (failed) return <p className="text-sm text-chorusify-danger">Couldn't load the pools.</p>;

  const byGroup = new Map<string, AdminPool[]>();
  for (const pool of pools) {
    const bucket = byGroup.get(pool.group) ?? [];
    bucket.push(pool);
    byGroup.set(pool.group, bucket);
  }

  const shown =
    detail && filter
      ? detail.tracks.filter((t) =>
          `${t.title} ${t.artist}`.toLowerCase().includes(filter.toLowerCase()),
        )
      : (detail?.tracks ?? []);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-slate-400">
        Every category and collection, with what its cached pool holds. Open one to read the tracks
        a round can draw from. Pools build the first time somebody plays.
      </p>

      {[...byGroup.entries()].map(([group, items]) => (
        <section key={group} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{group}</h3>

          {items.map((pool) => (
            <div key={pool.id} className="rounded-xl border border-white/5 bg-white/[0.03]">
              <button
                type="button"
                onClick={() => void open(pool.id)}
                aria-expanded={openId === pool.id}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">
                    {pool.label}
                  </span>
                  <span className="block text-[11px] text-slate-500">{pool.id}</span>
                </span>

                <span className="flex shrink-0 items-center gap-3 text-[11px]">
                  {pool.titleCount !== null && (
                    <span className="text-slate-400">{pool.titleCount} titles</span>
                  )}
                  {pool.trackCount === null ? (
                    <span className="rounded-md bg-white/5 px-2 py-0.5 text-slate-500">
                      not built
                    </span>
                  ) : (
                    <span className="rounded-md bg-emerald-400/10 px-2 py-0.5 font-semibold text-emerald-300">
                      {pool.trackCount} tracks
                    </span>
                  )}
                </span>
              </button>

              {openId === pool.id && (
                <div className="border-t border-white/5 px-3 py-3">
                  {detailError && <p className="text-sm text-slate-400">{detailError}</p>}
                  {!detail && !detailError && <VinylSpinner size={24} text="Loading tracks…" />}

                  {detail && (
                    <>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <input
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                          placeholder="Filter these tracks…"
                          className="w-full rounded-lg border border-white/10 bg-chorusify-bg/60 px-2.5 py-1.5 text-sm text-white placeholder:text-slate-600"
                        />
                        <span className="shrink-0 text-[11px] text-slate-500">
                          {shown.length}/{detail.tracks.length}
                        </span>
                      </div>

                      <ol className="max-h-80 overflow-y-auto text-sm">
                        {shown.map((track, i) => (
                          <li
                            key={track.deezerTrackId}
                            className="flex gap-2 border-b border-white/5 py-1.5 last:border-0"
                          >
                            <span className="w-8 shrink-0 text-right text-[11px] text-slate-600">
                              {i + 1}
                            </span>
                            {/* In a soundtrack pool the answer is the film, so it leads; the
                                song and performer are the clue and sit underneath. */}
                            <span className="min-w-0">
                              <span className="block truncate text-slate-200">{track.title}</span>
                              <span className="block truncate text-[11px] text-slate-500">
                                {track.artist}
                              </span>
                            </span>
                          </li>
                        ))}
                        {shown.length === 0 && (
                          <li className="py-2 text-slate-500">Nothing matches that filter.</li>
                        )}
                      </ol>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
