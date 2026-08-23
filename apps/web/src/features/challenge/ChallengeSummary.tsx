import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { SourceStandings, ChallengeStandings } from './ChallengeLeaderboard';
import { ChallengeGuessDistribution } from './ChallengeGuessDistribution';
import { useSession } from '../../hooks/useSession';
import { renderResultCard, shareResultCard } from '../stats/resultCard';
import type {
  ArtistLeaderboardEntry,
  GuessDistributionBucket,
  RevealedSong,
  SourceStanding,
} from '../../types/api';

interface SongEntry {
  song: RevealedSong;
  correct: boolean;
}

interface ChallengeSummaryProps {
  /** The artist's name or the category's label. */
  subjectName: string;
  songsCorrect: number;
  totalGuessesUsed: number;
  totalRounds: number;
  timeTakenSeconds?: number | null;
  /** Absolute URL that re-opens this exact challenge. Omitted when there's nothing to share. */
  shareUrl?: string;
  /** One entry per song answered, in order — drawn as the share grid. */
  runHistory?: boolean[];
  /** All songs revealed during the run, used to show "Songs you missed". */
  revealedSongs?: SongEntry[];
  loadLeaderboard: () => Promise<{
    entries: SourceStanding[];
    mine: Omit<SourceStanding, 'rank' | 'displayName' | 'isYou'> | null;
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
  runHistory = [],
  revealedSongs = [],
  loadLeaderboard,
  loadChallengeLeaderboard,
  loadDistribution,
  onPlayAgain,
  browse,
}: ChallengeSummaryProps) {
  const [copied, setCopied] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [showMissed, setShowMissed] = useState(false);
  const { user } = useSession();
  const missedSongs = revealedSongs.filter((e) => !e.correct);

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
        <div className="w-full rounded-2xl border border-chorusify-accent/30 bg-chorusify-accent/10 p-4">
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

      {/* A shared link's own board replaces the artist board: the people who played this exact
          challenge are the comparison that matters, and they all played the same songs. */}
      {loadChallengeLeaderboard ? (
        <ChallengeStandings load={loadChallengeLeaderboard} />
      ) : (
        <SourceStandings load={loadLeaderboard} subjectName={subjectName} />
      )}

      <ChallengeGuessDistribution load={loadDistribution} />

      {missedSongs.length > 0 && (
        <div className="w-full">
          <button
            type="button"
            onClick={() => setShowMissed((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.06]"
          >
            <span>Songs you missed ({missedSongs.length})</span>
            <span className="text-xs text-slate-500">{showMissed ? '▲' : '▼'}</span>
          </button>
          {showMissed && (
            <motion.ul
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-2 flex flex-col gap-2"
            >
              {missedSongs.map((entry, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5"
                >
                  {entry.song.albumArtUrl ? (
                    <img
                      src={entry.song.albumArtUrl}
                      alt=""
                      className="h-10 w-10 flex-shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                    />
                  ) : (
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm">
                      🎵
                    </div>
                  )}
                  <div className="min-w-0 text-left">
                    <p className="truncate text-sm font-semibold text-white">{entry.song.title}</p>
                    <p className="truncate text-xs text-slate-400">{entry.song.artist}</p>
                  </div>
                </li>
              ))}
            </motion.ul>
          )}
        </div>
      )}

      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          disabled={rendering}
          onClick={() => {
            setRendering(true);
            void renderResultCard({
              subject: subjectName,
              headline: `${songsCorrect}/${totalRounds}`,
              caption: timeTakenSeconds != null ? formatTime(timeTakenSeconds) : undefined,
              history: runHistory,
              totalRounds,
            })
              .then((blob) => {
                if (blob) {
                  return shareResultCard(
                    blob,
                    `chorusify-${subjectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`,
                    `${songsCorrect}/${totalRounds} on ${subjectName}`,
                  );
                }
              })
              .finally(() => setRendering(false));
          }}
          className="btn-primary w-full disabled:opacity-50"
        >
          {rendering ? 'Making image…' : 'Share result'}
        </button>

        {shareUrl && (
          <button
            type="button"
            onClick={handleShare}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            {copied ? 'Link copied!' : 'Challenge a friend'}
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
