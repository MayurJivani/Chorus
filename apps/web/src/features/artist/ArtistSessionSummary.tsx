import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { ArtistLeaderboard } from './ArtistLeaderboard';
import { ArtistGuessDistribution } from './ArtistGuessDistribution';
import { useSession } from '../../hooks/useSession';

interface ArtistSessionSummaryProps {
  artistId: number;
  artistName: string;
  songsCorrect: number;
  totalGuessesUsed: number;
  totalRounds: number;
  timeTakenSeconds?: number | null;
  challengeId?: number;
  guessMode?: 'search' | 'choice';
  onPlayAgain: () => void;
}

function formatTime(seconds: number | null | undefined): string {
  if (seconds == null) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function ArtistSessionSummary({
  artistId,
  artistName,
  songsCorrect,
  totalGuessesUsed,
  totalRounds,
  timeTakenSeconds,
  challengeId,
  guessMode = 'search',
  onPlayAgain,
}: ArtistSessionSummaryProps) {
  const [copied, setCopied] = useState(false);
  const { user } = useSession();

  useEffect(() => {
    if (songsCorrect >= totalRounds * 0.7) {
      void confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
    }
  }, [songsCorrect, totalRounds]);

  const handleShare = () => {
    if (!challengeId) return;
    const shareUrl = `${window.location.origin}/artist/${artistId}/play?challengeId=${challengeId}&guessMode=${guessMode}`;
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

      <ArtistLeaderboard artistId={artistId} artistName={artistName} challengeId={challengeId} />

      <ArtistGuessDistribution artistId={artistId} />

      <div className="flex w-full flex-col gap-3">
        {challengeId && (
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
        <Link to="/artist" className="btn-ghost w-full text-center">
          Play Another Artist
        </Link>
      </div>
    </motion.div>
  );
}
