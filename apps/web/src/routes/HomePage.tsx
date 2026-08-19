import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useCountdownToNextPuzzle } from '../hooks/useCountdown';
import { useSession } from '../hooks/useSession';
import { getMyStats } from '../api/stats';
import type { StatsResponse } from '../types/api';

function AnimatedWaveform({ isPlaying = true }: { isPlaying?: boolean }) {
  return (
    <div className="flex h-8 items-end gap-1.5">
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

/**
 * The modes, minus the daily.
 *
 * The daily is the button above rather than a sixth card: it was previously both, so the first
 * thing on the page and the first card in the grid were the same link.
 *
 * Each card is icon, name and one line. The numbered badges and per-card "Play today →" links
 * that used to sit on them were noise: the whole card is already a link, and the number ranked
 * nothing.
 */
const MODES: { to: string; icon: string; title: string; blurb: string }[] = [
  {
    to: '/artist',
    icon: '🎤',
    title: 'Artist Mode',
    blurb: 'Ten songs from any artist you pick.',
  },
  {
    to: '/categories',
    icon: '📻',
    title: 'Categories',
    blurb: 'Top hits by year, chart or genre.',
  },
  {
    to: '/survival',
    icon: '💀',
    title: 'Survival',
    blurb: 'Endless songs. One wrong answer ends the run.',
  },
  {
    to: '/era',
    icon: '📅',
    title: 'Guess the Year',
    blurb: 'Hear a song and place it in time.',
  },
  {
    to: '/multiplayer',
    icon: '⚡',
    title: 'Multiplayer',
    blurb: 'Race friends in real time.',
  },
];

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
    <div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center gap-8 px-4 py-10 text-center sm:py-14">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="flex flex-col items-center gap-5"
      >
        <div className="animate-float">
          <AnimatedWaveform />
        </div>

        <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">
          Guess your <span className="text-purple-400">favourite</span> music!
        </h1>
        <p className="max-w-md text-base leading-relaxed text-slate-400">
          Hear a growing snippet and name the song in as few listens as you can.
        </p>

        <div className="flex flex-col items-center gap-2.5">
          <Link to="/play" className="btn-primary !px-9 !py-3.5 !text-base">
            Play today&apos;s challenge
          </Link>
          {/* Streak and countdown share one line: two stacked badges said less than this does. */}
          <p className="text-sm text-slate-500">
            {stats && stats.currentStreak > 0 ? (
              <>
                <span aria-hidden="true">🔥</span>{' '}
                <span className="font-semibold text-slate-300">{stats.currentStreak}</span> day
                streak · next in{' '}
              </>
            ) : (
              'Next puzzle in '
            )}
            <span className="font-mono font-semibold text-slate-300">{countdown}</span>
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {MODES.map((mode) => (
          <Link
            key={mode.to}
            to={mode.to}
            className="glass group flex flex-col gap-3 rounded-2xl border border-white/10 p-5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25"
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-xl"
              aria-hidden="true"
            >
              {mode.icon}
            </span>
            <span>
              <span className="block font-bold text-white">{mode.title}</span>
              <span className="mt-1 block text-sm leading-relaxed text-slate-400">
                {mode.blurb}
              </span>
            </span>
          </Link>
        ))}
      </motion.div>
    </div>
  );
}
