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

/** The game modes, kept as data so the grid below stays a single declarative block. */
const MODES = [
  {
    to: '/play',
    icon: '🗓️',
    title: 'Daily Challenge',
    description: 'One shared song per day. Keep your streak alive.',
    cta: 'Play today',
  },
  {
    to: '/artist',
    icon: '🎤',
    title: 'Artist Mode',
    description: 'Pick any artist and guess 10 songs from their discography.',
    cta: 'Choose an artist',
  },
  {
    to: '/categories',
    icon: '📻',
    title: 'Categories',
    description: 'Top hits by year, chart or genre — every song a different artist.',
    cta: 'Browse categories',
  },
  {
    to: '/survival',
    icon: '💀',
    title: 'Survival',
    description: 'Endless songs. One wrong answer ends the run.',
    cta: 'Start a run',
  },
  {
    to: '/multiplayer',
    icon: '⚡',
    title: 'Multiplayer',
    description: 'Race friends in real time on a shared snippet timer.',
    cta: 'Create a room',
  },
] as const;

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
    // Tighter on small screens so the three modes sit near the fold instead of a full scroll
    // below the hero.
    <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-8 px-4 py-8 text-center sm:gap-12 sm:py-16">
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
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">
            Guess your <span className="text-purple-400">favourite</span> music!
          </h1>
          <p className="max-w-md text-slate-400 text-lg leading-relaxed mx-auto">
            Hear a growing snippet: 1 second, then 2, 4, 7… Guess in as few listens as you can. A
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
            Play today&apos;s challenge
          </Link>
          <p className="text-sm text-slate-500">
            Next puzzle in{' '}
            <span className="font-mono font-semibold text-slate-300">{countdown}</span>
          </p>
        </motion.div>
      </motion.div>

      {/* The modes. These used to be two cards with Multiplayer spanning the row beneath, which
          read as one headline mode plus extras rather than a choice between several. An equal
          grid under its own heading makes the choice the point. */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="flex w-full max-w-4xl flex-col gap-5"
      >
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-purple-400">
            Five ways to play
          </h2>
          <div className="h-px w-16 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map((mode, index) => (
            <Link
              key={mode.to}
              to={mode.to}
              className="glass group relative flex flex-col gap-3 rounded-2xl p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-2xl"
            >
              <span
                className="absolute right-4 top-4 font-mono text-xs text-slate-600 transition-colors group-hover:text-slate-400"
                aria-hidden="true"
              >
                0{index + 1}
              </span>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-xl">
                {mode.icon}
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">{mode.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{mode.description}</p>
              </div>

              <span className="mt-auto pt-2 text-xs font-semibold text-slate-300 transition-colors group-hover:text-white">
                {mode.cta} →
              </span>
            </Link>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
