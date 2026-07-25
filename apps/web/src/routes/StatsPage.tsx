import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getMyStats } from '../api/stats';
import { useSession } from '../hooks/useSession';
import { GuessDistributionChart } from '../features/stats/GuessDistributionChart';
import { ShareCard } from '../features/stats/ShareCard';
import type { StatsResponse } from '../types/api';

export function StatsPage() {
  const { user, guestId } = useSession();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Re-fetch whenever the underlying identity changes (login/register/logout), not just once
  // on mount — otherwise stats from the previous session linger on screen.
  useEffect(() => {
    setLoading(true);
    getMyStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, [user, guestId]);

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-400">
        Loading stats…
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-400">
        Couldn&apos;t load stats.
      </div>
    );
  }

  const winRate =
    stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col items-center gap-8 px-4 py-12">
      <motion.h1
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-4xl font-extrabold gradient-text"
      >
        Your Stats
      </motion.h1>

      {/* Stat cards */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid w-full grid-cols-3 gap-3 text-center"
      >
        <Stat label="Played" value={stats.gamesPlayed} />
        <Stat label="Win %" value={`${winRate}%`} />
        <Stat label="Best streak" value={stats.maxStreak} />
      </motion.div>

      {/* Streak badge */}
      {stats.currentStreak > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="glass flex items-center gap-2 rounded-full px-5 py-2"
        >
          <span className="text-2xl">🔥</span>
          <span className="text-xl font-bold text-white">{stats.currentStreak}</span>
          <span className="text-sm text-slate-400">day streak</span>
        </motion.div>
      )}

      {/* Guess distribution */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass w-full rounded-2xl p-5"
      >
        <h2 className="mb-4 text-base font-semibold text-slate-200">Guess distribution</h2>
        <GuessDistributionChart distribution={stats.guessDistribution} />
      </motion.div>

      <ShareCard stats={stats} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass group rounded-2xl py-5 px-2 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-chorus-accent/10 hover:border-chorus-accent/30">
      <p className="text-2xl font-extrabold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{label}</p>
    </div>
  );
}
