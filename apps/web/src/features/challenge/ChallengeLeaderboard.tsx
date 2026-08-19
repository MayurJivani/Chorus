import { useEffect, useState } from 'react';
import type { ArtistLeaderboardEntry } from '../../types/api';

interface ChallengeLeaderboardProps {
  /** Standings across every run of this artist/category, plus the caller's own best. */
  loadOverall: () => Promise<{
    entries: ArtistLeaderboardEntry[];
    myBest: {
      songsCorrect: number;
      totalRounds: number;
      totalGuessesUsed: number;
      timeTakenSeconds: number | null;
    } | null;
  }>;
  /** Standings for one shared challenge. When given, it replaces the overall board — the
   *  people who played this exact link are the interesting comparison. */
  loadForChallenge?: (() => Promise<{ entries: ArtistLeaderboardEntry[] }>) | null;
  /** e.g. "Queen" or "Top Hits 2024". */
  subjectName?: string;
}

function formatTime(seconds: number | null | undefined): string {
  if (seconds == null) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function ChallengeLeaderboard({
  loadOverall,
  loadForChallenge,
  subjectName,
}: ChallengeLeaderboardProps) {
  const [entries, setEntries] = useState<ArtistLeaderboardEntry[]>([]);
  const [myBest, setMyBest] = useState<{
    songsCorrect: number;
    totalRounds: number;
    totalGuessesUsed: number;
    timeTakenSeconds: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const request = loadForChallenge
      ? loadForChallenge().then((res) => ({ entries: res.entries, myBest: null }))
      : loadOverall();

    request
      .then((res) => {
        if (cancelled) return;
        setEntries(res.entries);
        setMyBest(res.myBest);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setMyBest(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadOverall, loadForChallenge]);

  if (loading) {
    return <p className="text-sm text-slate-400 text-center py-2">Loading leaderboard...</p>;
  }

  const titleText = loadForChallenge
    ? 'Challenge Leaderboard'
    : subjectName
      ? `${subjectName} Leaderboard`
      : 'Global Leaderboard';

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          {titleText}
        </h3>
        {loadForChallenge != null && (
          <span className="text-xs text-purple-400 font-semibold px-2 py-0.5 rounded-full bg-purple-950/40 border border-purple-500/20">
            Multiplayer Match
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">
          No completed runs yet. Be the first!
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {entries.map((entry) => (
            <li
              key={entry.rank}
              className={
                'flex items-center justify-between rounded-xl px-4 py-2.5 text-sm border transition-colors ' +
                (entry.isYou
                  ? 'bg-white/10 border-white/20 text-white font-medium shadow-sm'
                  : 'bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/[0.04]')
              }
            >
              <span className="truncate pr-2">
                #{entry.rank} {entry.displayName}
                {entry.isYou ? ' (you)' : ''}
              </span>
              <span className="flex items-center gap-2 shrink-0 font-mono text-xs font-semibold">
                <span className="text-slate-200">
                  {entry.songsCorrect}/{entry.totalRounds}
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-400">{entry.totalGuessesUsed}g</span>
                {entry.timeTakenSeconds != null && (
                  <>
                    <span className="text-slate-500">·</span>
                    <span className="text-purple-300">⏱ {formatTime(entry.timeTakenSeconds)}</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {myBest && (
        <p className="text-xs text-slate-500 text-center mt-1">
          Your best:{' '}
          <span className="font-semibold text-slate-300">
            {myBest.songsCorrect}/{myBest.totalRounds}
          </span>{' '}
          in <span className="font-semibold text-slate-300">{myBest.totalGuessesUsed} guesses</span>
          {myBest.timeTakenSeconds != null && (
            <>
              {' '}
              and{' '}
              <span className="font-semibold text-purple-400">
                ⏱ {formatTime(myBest.timeTakenSeconds)}
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
