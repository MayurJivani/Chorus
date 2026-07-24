import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useCountdownToNextPuzzle } from '../hooks/useCountdown';
import { useSession } from '../hooks/useSession';
import { getMyStats } from '../api/stats';
import type { StatsResponse } from '../types/api';

function AnimatedWaveform({ isPlaying = true }: { isPlaying?: boolean }) {
  return (
    <div className="flex items-end gap-1.5 h-10">
      {(['waveform-1', 'waveform-2', 'waveform-3', 'waveform-4', 'waveform-5'] as const).map(
        (anim, i) => (
          <span
            key={i}
            className={`w-1.5 rounded-full bg-white/70 ${isPlaying ? `animate-${anim}` : 'h-2'} transition-all duration-300`}
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ),
      )}
    </div>
  );
}

export function HomePage() {
  const countdown = useCountdownToNextPuzzle();
  const { user, guestId } = useSession();
  const [stats, setStats] = useState<StatsResponse | null>(null);

  useEffect(() => {
    getMyStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, [user, guestId]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-57px)] max-w-5xl flex-col items-center justify-center gap-12 px-4 py-16 text-center">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="flex flex-col items-center gap-6"
      >
        <div className="animate-float">
          <AnimatedWaveform />
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-5xl font-black tracking-tight sm:text-6xl text-white">
            Guess your <span className="text-purple-400">favourite</span> music!
          </h1>
          <p className="max-w-md text-slate-400 text-lg leading-relaxed mx-auto">
            Hear a growing snippet — 1 second, then 2, 4, 7… Guess in as few listens as you can. A
            fresh puzzle drops every day.
          </p>
        </div>

        {/* Streak badge */}
        {stats && stats.currentStreak > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="glass flex items-center gap-2 rounded-xl px-4 py-2"
          >
            <span className="text-xl">🔥</span>
            <span className="font-semibold text-white">{stats.currentStreak}</span>
            <span className="text-sm text-slate-400">day streak</span>
          </motion.div>
        )}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center gap-3"
        >
          <Link to="/play" className="btn-primary !px-9 !py-3.5 !text-base">
            Play today&apos;s puzzle
          </Link>
          <p className="text-sm text-slate-500">
            Next puzzle in{' '}
            <span className="font-mono font-semibold text-slate-300">{countdown}</span>
          </p>
        </motion.div>
      </motion.div>

      {/* Feature cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Link
          to="/play"
          className="glass group flex flex-col gap-3 rounded-2xl p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-2xl"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-xl border border-white/10">
            🗓️
          </div>
          <div>
            <h2 className="font-bold text-white text-lg">Daily Puzzle</h2>
            <p className="mt-1 text-sm text-slate-400">
              One shared song per day. Keep your streak alive.
            </p>
          </div>
          <span className="mt-auto text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
            Play now →
          </span>
        </Link>

        <Link
          to="/artist"
          className="glass group flex flex-col gap-3 rounded-2xl p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-2xl"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-xl border border-white/10">
            🎤
          </div>
          <div>
            <h2 className="font-bold text-white text-lg">Artist Mode</h2>
            <p className="mt-1 text-sm text-slate-400">
              Pick any artist, guess 10 songs from their discography.
            </p>
          </div>
          <span className="mt-auto text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
            Explore →
          </span>
        </Link>
      </motion.div>
    </div>
  );
}
