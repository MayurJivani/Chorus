import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSession } from '../hooks/useSession';
import { ArtistSearchInput } from '../features/artist/ArtistSearchInput';
import {
  acceptDuel,
  createDuel,
  getMyDuels,
  getOpenDuels,
  getRatingLeaderboard,
  matchmake,
} from '../api/duels';
import type { ArtistSearchResult, DuelView, RatingStanding } from '../types/api';

/** Where a duel's challenge is played, in whichever mode built it. */
function playHref(duel: DuelView): string {
  const base =
    duel.sourceType === 'category'
      ? `/category/${encodeURIComponent(duel.sourceId)}/play`
      : `/artist/${duel.sourceId}/play`;
  return `${base}?challengeId=${duel.challengeId}`;
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

/**
 * Rated 1v1.
 *
 * Both players get the same ten songs, which is the only reason a rating from this means
 * anything. Accounts only: a rating has to attach to something that survives clearing cookies.
 */
export function DuelsPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();

  const [mine, setMine] = useState<DuelView[]>([]);
  const [open, setOpen] = useState<DuelView[]>([]);
  const [board, setBoard] = useState<RatingStanding[]>([]);
  const [artist, setArtist] = useState<ArtistSearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [ratings] = await Promise.all([getRatingLeaderboard().catch(() => null)]);
    if (ratings) setBoard(ratings.entries);
    if (!user) return;
    const [minesafe, opensafe] = await Promise.all([
      getMyDuels().catch(() => []),
      getOpenDuels().catch(() => []),
    ]);
    setMine(minesafe);
    setOpen(opensafe);
  }, [user]);

  useEffect(() => {
    if (loading) return;
    void refresh();
  }, [loading, refresh]);

  const challenge = async () => {
    if (!artist || busy) return;
    setBusy(true);
    setError(null);
    try {
      const duel = await createDuel({ artistId: artist.id });
      navigate(`/artist/${artist.id}/play?challengeId=${duel.challengeId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start that duel.');
      setBusy(false);
    }
  };

  const take = async (duel: DuelView) => {
    setBusy(true);
    setError(null);
    try {
      await acceptDuel(duel.id);
      navigate(playHref(duel));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that duel.');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-4 py-6 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2 text-center"
      >
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Duels</h1>
        <p className="max-w-md text-sm text-slate-400">
          One challenge, two players, the same ten songs. Win and your rating goes up.
        </p>
      </motion.div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {!loading && !user ? (
        <div className="glass flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="text-sm text-slate-300">
            Duels are rated, so they need an account. A rating tied to a browser cookie would vanish
            the moment you cleared it.
          </p>
          <div className="flex gap-2">
            <Link to="/register" className="btn-primary !py-2 text-sm">
              Create an account
            </Link>
            <Link to="/login" className="btn-secondary !py-2 text-sm">
              Log in
            </Link>
          </div>
        </div>
      ) : (
        <>
          <section className="glass flex flex-col gap-4 rounded-2xl p-5">
            <div>
              <h2 className="font-bold text-white">Quick Match</h2>
              <p className="text-xs text-slate-400">
                Get matched with a random opponent on a popular artist. No setup needed.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const duel = await matchmake();
                  if (duel.opponent) {
                    navigate(playHref(duel));
                  } else {
                    await refresh();
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Matchmaking failed.');
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="btn-primary w-full disabled:opacity-50"
            >
              {busy ? 'Finding opponent…' : 'Find a match'}
            </button>
          </section>

          <section className="glass flex flex-col gap-4 rounded-2xl p-5">
            <div>
              <h2 className="font-bold text-white">Challenge someone</h2>
              <p className="text-xs text-slate-400">
                Pick an artist, then send the link to whoever you want to beat.
              </p>
            </div>
            <ArtistSearchInput onSelect={setArtist} />
            {artist && (
              <button
                type="button"
                onClick={() => void challenge()}
                disabled={busy}
                className="btn-primary w-full disabled:opacity-50"
              >
                {busy ? 'Starting…' : `Duel over ${artist.name}`}
              </button>
            )}
          </section>
        </>
      )}

      {user && open.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            Open duels
          </h2>
          <ul className="flex flex-col gap-2">
            {open.map((duel) => (
              <li
                key={duel.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{duel.label}</p>
                  <p className="truncate text-xs text-slate-400">
                    {duel.challenger.displayName} · {duel.challenger.rating}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void take(duel)}
                  disabled={busy}
                  className="btn-secondary shrink-0 !py-1.5 text-xs disabled:opacity-50"
                >
                  Accept
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {user && mine.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            Your duels
          </h2>
          <ul className="flex flex-col gap-2">
            {mine.map((duel) => {
              const you = duel.challenger.userId === user?.id ? duel.challenger : duel.opponent;
              const them = duel.challenger.userId === user?.id ? duel.opponent : duel.challenger;
              const delta =
                duel.ratingChange == null
                  ? null
                  : duel.challenger.userId === user?.id
                    ? duel.ratingChange.challenger
                    : duel.ratingChange.opponent;

              return (
                <li
                  key={duel.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{duel.label}</p>
                    <p className="truncate text-xs text-slate-400">
                      {them ? `vs ${them.displayName}` : 'Waiting for an opponent'}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    {duel.status === 'complete' ? (
                      <>
                        <p className="text-sm font-semibold text-white">
                          {duel.winnerId == null
                            ? 'Draw'
                            : duel.winnerId === user?.id
                              ? 'Won'
                              : 'Lost'}
                        </p>
                        {delta != null && (
                          <p
                            className={
                              'font-mono text-xs ' +
                              (delta > 0
                                ? 'text-emerald-400'
                                : delta < 0
                                  ? 'text-red-400'
                                  : 'text-slate-400')
                            }
                          >
                            {formatDelta(delta)}
                          </p>
                        )}
                      </>
                    ) : you?.result ? (
                      <p className="text-xs text-slate-400">Waiting for them</p>
                    ) : (
                      <Link to={playHref(duel)} className="btn-secondary !py-1.5 text-xs">
                        Play
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Ratings</h2>
        {board.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nobody has finished a rated duel yet. Everyone starts on 1200.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {board.map((entry) => (
              <li
                key={entry.rank}
                className={
                  'flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm ' +
                  (entry.isYou
                    ? 'border-white/20 bg-white/10 font-medium text-white'
                    : 'border-white/5 bg-white/[0.02] text-slate-300')
                }
              >
                <span className="truncate pr-2">
                  #{entry.rank} {entry.displayName}
                  {entry.isYou ? ' (you)' : ''}
                </span>
                <span className="shrink-0 font-mono text-xs">
                  <span className="font-bold text-purple-300">{entry.rating}</span>{' '}
                  <span className="text-slate-500">
                    {entry.ratedDuels} {entry.ratedDuels === 1 ? 'duel' : 'duels'}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
