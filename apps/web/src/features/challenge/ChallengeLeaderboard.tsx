import { useEffect, useState, type ReactNode } from 'react';
import type { ArtistLeaderboardEntry, SourceStanding } from '../../types/api';

/**
 * Two boards, deliberately not one component with a union.
 *
 * They answer different questions and so carry different numbers: an artist/category board ranks
 * players by everything they have ever done with that artist, while a shared-challenge board
 * ranks one run each. Squashing both into a single row shape made every column ambiguous.
 */

function formatTime(seconds: number | null | undefined): string {
  if (seconds == null) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Shared chrome: heading, loading and empty states, and the row list. */
function Board({
  title,
  badge,
  loading,
  isEmpty,
  emptyMessage,
  children,
  footer,
}: {
  title: string;
  badge?: ReactNode;
  loading: boolean;
  isEmpty: boolean;
  emptyMessage: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (loading) {
    return <p className="text-sm text-slate-400 text-center py-2">Loading leaderboard...</p>;
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">{title}</h3>
        {badge}
      </div>

      {isEmpty ? (
        <p className="text-sm text-slate-400 text-center py-4">{emptyMessage}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">{children}</ol>
      )}

      {footer}
    </div>
  );
}

function Row({
  rank,
  displayName,
  isYou,
  stats,
}: {
  rank: number;
  displayName: string;
  isYou: boolean;
  stats: ReactNode;
}) {
  return (
    <li
      className={
        'flex items-center justify-between rounded-xl px-4 py-2.5 text-sm border transition-colors ' +
        (isYou
          ? 'bg-white/10 border-white/20 text-white font-medium shadow-sm'
          : 'bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/[0.04]')
      }
    >
      <span className="truncate pr-2">
        #{rank} {displayName}
        {isYou ? ' (you)' : ''}
      </span>
      <span className="flex items-center gap-2 shrink-0 font-mono text-xs font-semibold">
        {stats}
      </span>
    </li>
  );
}

/** The caller's own record: the same aggregate as a ranked row, minus the ranking. */
type MyTotals = Omit<SourceStanding, 'rank' | 'displayName' | 'isYou'> | null;

interface SourceStandingsProps {
  load: () => Promise<{
    entries: SourceStanding[];
    mine: MyTotals;
  }>;
  /** e.g. "Queen" or "Top Hits 2024". */
  subjectName?: string;
}

/**
 * Standings for one artist or category, by cumulative play.
 *
 * Total songs named rather than a single best run: every visit builds a freshly randomized
 * challenge, so ranking on the best one rewarded whoever replayed until they drew an easy set.
 */
export function SourceStandings({ load, subjectName }: SourceStandingsProps) {
  const [entries, setEntries] = useState<SourceStanding[]>([]);
  const [mine, setMine] = useState<MyTotals>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .then((res) => {
        if (cancelled) return;
        setEntries(res.entries);
        setMine(res.mine);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setMine(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <Board
      title={subjectName ? `${subjectName} Leaderboard` : 'Leaderboard'}
      loading={loading}
      isEmpty={entries.length === 0}
      emptyMessage="No ranked players yet. Be the first!"
      footer={
        mine ? (
          <p className="text-xs text-slate-500 text-center mt-1">
            You:{' '}
            <span className="font-semibold text-slate-300">
              {mine.songsCorrect}/{mine.songsPossible}
            </span>{' '}
            across{' '}
            <span className="font-semibold text-slate-300">
              {mine.runs} {mine.runs === 1 ? 'run' : 'runs'}
            </span>{' '}
            · <span className="font-semibold text-slate-300">{mine.accuracy}%</span>
            {mine.fastestRunSeconds != null && (
              <>
                {' '}
                · best time{' '}
                <span className="font-semibold text-purple-400">
                  ⏱ {formatTime(mine.fastestRunSeconds)}
                </span>
              </>
            )}
          </p>
        ) : null
      }
    >
      {entries.map((entry) => (
        <Row
          key={entry.rank}
          rank={entry.rank}
          displayName={entry.displayName}
          isYou={entry.isYou}
          stats={
            <>
              <span className="text-slate-200">{entry.songsCorrect}</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">{entry.accuracy}%</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-500">
                {entry.runs} {entry.runs === 1 ? 'run' : 'runs'}
              </span>
            </>
          }
        />
      ))}
    </Board>
  );
}

/** Standings for one shared challenge — everyone here played the same ten songs, so a single
 *  run is the right unit and comparing them directly is fair. */
export function ChallengeStandings({
  load,
}: {
  load: () => Promise<{ entries: ArtistLeaderboardEntry[] }>;
}) {
  const [entries, setEntries] = useState<ArtistLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .then((res) => {
        if (cancelled) return;
        setEntries(res.entries);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <Board
      title="Challenge Leaderboard"
      badge={
        <span className="text-xs text-purple-400 font-semibold px-2 py-0.5 rounded-full bg-purple-950/40 border border-purple-500/20">
          Shared challenge
        </span>
      }
      loading={loading}
      isEmpty={entries.length === 0}
      emptyMessage="No completed runs yet. Be the first!"
    >
      {entries.map((entry) => (
        <Row
          key={entry.rank}
          rank={entry.rank}
          displayName={entry.displayName}
          isYou={entry.isYou}
          stats={
            <>
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
            </>
          }
        />
      ))}
    </Board>
  );
}
