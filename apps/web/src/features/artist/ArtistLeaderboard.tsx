import { useEffect, useState } from 'react';
import { getArtistLeaderboard, getChallengeLeaderboard } from '../../api/artists';
import type { ArtistLeaderboardEntry } from '../../types/api';

interface ArtistLeaderboardProps {
  artistId: number;
  artistName?: string;
  challengeId?: number;
}

function formatTime(seconds: number | null | undefined): string {
  if (seconds == null) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function ArtistLeaderboard({ artistId, artistName, challengeId }: ArtistLeaderboardProps) {
  const [entries, setEntries] = useState<ArtistLeaderboardEntry[]>([]);
  const [myBest, setMyBest] = useState<{
    songsCorrect: number;
    totalGuessesUsed: number;
    timeTakenSeconds: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (challengeId != null) {
      getChallengeLeaderboard(artistId, challengeId)
        .then((res) => {
          setEntries(res.entries);
          setMyBest(null);
          setLoading(false);
        })
        .catch(() => {
          setEntries([]);
          setLoading(false);
        });
    } else {
      getArtistLeaderboard(artistId)
        .then((res) => {
          setEntries(res.entries);
          setMyBest(res.myBest);
          setLoading(false);
        })
        .catch(() => {
          setEntries([]);
          setMyBest(null);
          setLoading(false);
        });
    }
  }, [artistId, challengeId]);

  if (loading) {
    return <p className="text-sm text-slate-400 text-center py-2">Loading leaderboard...</p>;
  }

  const titleText =
    challengeId != null
      ? 'Challenge Leaderboard'
      : artistName
        ? `${artistName} Leaderboard`
        : 'Global Leaderboard';

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          {titleText}
        </h3>
        {challengeId != null && (
          <span className="text-xs text-purple-400 font-semibold px-2 py-0.5 rounded-full bg-purple-950/40 border border-purple-500/20">
            Multiplayer Match
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">
          No completed runs yet — be the first!
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
                <span className="text-slate-200">{entry.songsCorrect}/10</span>
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
          Your best: <span className="font-semibold text-slate-300">{myBest.songsCorrect}/10</span>{' '}
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
