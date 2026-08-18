import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { ChallengeLeaderboard } from './ChallengeLeaderboard';
import { ChallengeGuessDistribution } from './ChallengeGuessDistribution';
import { useSession } from '../../hooks/useSession';
import type { ArtistLeaderboardEntry, GuessDistributionBucket } from '../../types/api';

interface ChallengeSummaryProps {
  /** The artist's name or the category's label. */
  subjectName: string;
  songsCorrect: number;
  totalGuessesUsed: number;
  totalRounds: number;
  timeTakenSeconds?: number | null;
  /** Absolute URL that re-opens this exact challenge. Omitted when there's nothing to share. */
  shareUrl?: string;
  loadLeaderboard: () => Promise<{
    entries: ArtistLeaderboardEntry[];
    myBest: {
      songsCorrect: number;
      totalGuessesUsed: number;
      timeTakenSeconds: number | null;
    } | null;
  }>;
  loadChallengeLeaderboard?: (() => Promise<{ entries: ArtistLeaderboardEntry[] }>) | null;
  loadDistribution: () => Promise<GuessDistributionBucket[]>;
  onPlayAgain: () => void;
  /** Back to the picker for this mode. */
  browse: { to: string; label: string };
}

function formatTime(seconds: number | null | undefined): string {
  if (seconds == null) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function ChallengeSummary({
  subjectName,
  songsCorrect,
  totalGuessesUsed,
  totalRounds,
  timeTakenSeconds,
  shareUrl,
  loadLeaderboard,
  loadChallengeLeaderboard,
  loadDistribution,
  onPlayAgain,
  browse,
}: ChallengeSummaryProps) {
  const [copied, setCopied] = useState(false);
  const { user } = useSession();

  useEffect(() => {
    if (songsCorrect >= totalRounds * 0.7) {
      void confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
    }
  }, [songsCorrect, totalRounds]);

  const handleShare = () => {
    if (!shareUrl) return;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass flex w-full max-w-md flex-col items-center gap-6 rounded-2xl p-6 text-center border border-white/10"
    >
      <div>
        <h2 className="text-2xl font-extrabold text-white">Challenge Complete!</h2>
        <p className="mt-2 text-base text-slate-300">
          {songsCorrect}/{totalRounds} songs · {totalGuessesUsed} guesses
          {timeTakenSeconds != null && (
            <span className="block text-purple-400 font-semibold font-mono text-sm mt-1">
              ⏱ {formatTime(timeTakenSeconds)}
            </span>
          )}
        </p>
      </div>

      {/* A guest has just earned a score they can never be ranked with, so this is the moment
          the offer is worth making — right beside the leaderboard they are missing from. */}
      {!user && (
        <div className="w-full rounded-2xl border border-chorus-accent/30 bg-chorus-accent/10 p-4">
          <p className="text-sm font-semibold text-white">
            {songsCorrect}/{totalRounds}. Want this on the leaderboard?
          </p>
          <p className="mt-1 text-xs text-slate-300">
            Guest runs aren&apos;t ranked. Create an account to claim your spot and keep your
            scores.
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Link to="/register" className="btn-primary flex-1 !py-2 text-sm">
              Claim your spot
            </Link>
            <Link to="/login" className="btn-secondary flex-1 !py-2 text-sm">
              Log in
            </Link>
          </div>
        </div>
      )}

      <ChallengeLeaderboard
        loadOverall={loadLeaderboard}
        loadForChallenge={loadChallengeLeaderboard}
        subjectName={subjectName}
      />

      <ChallengeGuessDistribution load={loadDistribution} />

      <div className="flex w-full flex-col gap-3">
        {shareUrl && (
          <button
            type="button"
            onClick={handleShare}
            className="btn-primary w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-900/30"
          >
            {copied ? '✅ Link Copied!' : '👥 Challenge a Friend'}
          </button>
        )}
        <button type="button" onClick={onPlayAgain} className="btn-secondary w-full">
          Play New Challenge
        </button>
        <Link to={browse.to} className="btn-ghost w-full text-center">
          {browse.label}
        </Link>
      </div>
    </motion.div>
  );
}
