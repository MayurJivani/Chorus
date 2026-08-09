import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getLeaderboard } from '../api/leaderboard';
import { formatDuration } from '../features/stats/formatDuration';
import type { LeaderboardResponse } from '../types/api';

const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeaderboard()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-400">
        Loading leaderboard…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-400">
        Couldn&apos;t load the leaderboard.
      </div>
    );
  }

  const { players, mostPlayedArtists, isRegistered } = data;

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center gap-6 px-4 py-8">
      <motion.h1
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl font-extrabold gradient-text"
      >
        Leaderboard
      </motion.h1>

      {/* Guests can play everything but cannot be ranked, so say so here rather than letting
          them wonder why they are missing from a board they just earned a place on. */}
      {!isRegistered && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass flex w-full flex-col items-center gap-3 rounded-2xl p-5 text-center"
        >
          <p className="text-sm text-slate-300">
            You&apos;re playing as a guest, so your runs aren&apos;t ranked here.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/register" className="btn-primary">
              Claim your spot
            </Link>
            <Link to="/login" className="btn-secondary">
              Log in
            </Link>
          </div>
        </motion.div>
      )}

      {/* Most played artists */}
      {mostPlayedArtists.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass w-full rounded-2xl p-5"
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-300">
            Most played artists
          </h2>
          <ul className="flex flex-col gap-1.5">
            {mostPlayedArtists.map((artist, index) => (
              <li key={artist.deezerArtistId}>
                <Link
                  to={`/artist/${artist.deezerArtistId}/play`}
                  className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-sm transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <span className="w-5 text-center font-mono text-xs text-slate-500">
                    {index + 1}
                  </span>
                  <span className="flex-1 truncate text-slate-100">{artist.artistName}</span>
                  <span className="shrink-0 font-mono text-xs text-slate-400 tabular-nums">
                    {artist.runs} {artist.runs === 1 ? 'run' : 'runs'}
                  </span>
                  <span className="hidden shrink-0 font-mono text-xs text-slate-500 tabular-nums sm:inline">
                    avg {artist.averageScore}/10
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {/* Player standings */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass w-full rounded-2xl p-5"
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            Top players
          </h2>
          <span className="text-[11px] text-slate-500">by songs guessed</span>
        </div>

        {players.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            Nobody has finished an artist challenge yet — be the first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="w-8 pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Player</th>
                  <th className="pb-2 text-right font-medium">Correct</th>
                  <th className="pb-2 text-right font-medium">Acc</th>
                  <th className="pb-2 text-right font-medium">Best</th>
                  <th className="pb-2 text-right font-medium">Fastest</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
                  <tr
                    key={player.userId}
                    className={`border-t border-white/5 ${
                      player.isYou ? 'bg-chorus-accent/10 text-white' : 'text-slate-300'
                    }`}
                  >
                    <td className="py-2 font-mono text-xs text-slate-500">
                      {MEDALS[player.rank - 1] ?? player.rank}
                    </td>
                    <td className="max-w-[10rem] truncate py-2 font-medium">
                      {player.displayName}
                      {player.isYou && (
                        <span className="ml-1.5 text-[10px] uppercase text-chorus-accent">you</span>
                      )}
                      <span className="ml-2 font-mono text-[11px] text-slate-500">
                        {player.runs} {player.runs === 1 ? 'run' : 'runs'}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {player.songsCorrect}
                    </td>
                    <td className="py-2 text-right font-mono text-xs text-slate-400 tabular-nums">
                      {player.accuracy}%
                    </td>
                    <td className="py-2 text-right font-mono text-xs text-slate-400 tabular-nums">
                      {player.bestRun}/10
                    </td>
                    <td className="py-2 text-right font-mono text-xs text-slate-400 tabular-nums">
                      {formatDuration(player.fastestRunSeconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>

      <p className="max-w-md text-center text-[11px] leading-relaxed text-slate-600">
        Ranked by total songs guessed across finished artist runs, so playing more counts as well as
        scoring well. Ties go to fewer guesses, then faster times.
      </p>
    </div>
  );
}
