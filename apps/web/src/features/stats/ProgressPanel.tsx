import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getMyProgress } from '../../api/stats';
import type { MasteryEntry, ProgressSummary } from '../../types/api';

const MODE_LABELS: Record<string, string> = {
  artist: 'Artist Mode',
  category: 'Categories',
  era: 'Guess the Year',
};

const GROUP_LABELS: Record<string, string> = {
  now: 'Charts',
  year: 'By year',
  genre: 'By genre',
};

function formatTime(seconds: number | null): string {
  if (seconds == null) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Level, XP and what you actually know.
 *
 * All of it is derived from runs already recorded, so it is right for players who were here
 * before any of this existed rather than starting everyone at zero.
 */
export function ProgressPanel() {
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyProgress()
      .then(setProgress)
      .catch(() => setProgress(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-400">Loading progress…</p>;
  if (!progress) return null;

  const { level, sources, byMode, byCategoryGroup, survival, daily, duels, mastery } = progress;
  const modes = (['artist', 'category', 'era'] as const).filter((m) => byMode[m].runs > 0);
  const groups = (['now', 'year', 'genre'] as const).filter((g) => byCategoryGroup[g]);

  return (
    <div className="flex flex-col gap-5">
      <section className="glass rounded-2xl p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-white">Level {level.level}</h2>
          <span className="font-mono text-xs text-slate-400">{level.xp.toLocaleString()} XP</span>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(level.progress * 100)}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-chorus-accent2"
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {(level.nextLevelXp - level.xp).toLocaleString()} XP to level {level.level + 1}
        </p>

        {/* Where the XP came from, so the number is explainable rather than magic. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Songs named', sources.songs],
            ['Daily wins', sources.dailyWins],
            ['Survival', sources.survival],
            ['Duel wins', sources.duelWins],
          ].map(([label, value]) => (
            <div
              key={label as string}
              className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5"
            >
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
              <p className="font-mono text-sm font-bold text-white">
                {(value as number).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </section>

      {(modes.length > 0 || daily.played > 0 || survival.runs > 0 || duels.played > 0) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">By mode</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {daily.played > 0 && (
              <Row title="Daily Challenge" detail={`${daily.won}/${daily.played} won`} />
            )}
            {modes.map((mode) => (
              <Row
                key={mode}
                title={MODE_LABELS[mode]!}
                detail={`${byMode[mode].songsCorrect}/${byMode[mode].songsPossible} songs · ${byMode[mode].accuracy}%`}
              />
            ))}
            {survival.runs > 0 && (
              <Row
                title="Survival"
                detail={`best ${survival.bestStreak} · ${survival.totalSongs} songs over ${survival.runs} runs`}
              />
            )}
            {duels.played > 0 && (
              <Row
                title="Duels"
                detail={`${duels.won}/${duels.played} won${duels.rating != null ? ` · ${duels.rating} rating` : ''}`}
              />
            )}
          </div>
        </section>
      )}

      {groups.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            Where you are strongest
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {groups.map((group) => (
              <Row
                key={group}
                title={GROUP_LABELS[group]!}
                detail={`${byCategoryGroup[group]!.accuracy}% over ${byCategoryGroup[group]!.runs} runs`}
              />
            ))}
          </div>
        </section>
      )}

      {mastery.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
            Your artists and categories
          </h2>
          <ul className="flex flex-col gap-2">
            {mastery.map((entry) => (
              <MasteryRow key={`${entry.sourceType}:${entry.sourceId}`} entry={entry} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Row({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-0.5 text-xs text-slate-400">{detail}</p>
    </div>
  );
}

function MasteryRow({ entry }: { entry: MasteryEntry }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">{entry.label}</p>
        <p className="truncate text-xs text-slate-500">
          {/* Absolute first: "47 songs named" lands on day one, a percentile does not. */}
          {entry.songsCorrect} songs named over {entry.runs} {entry.runs === 1 ? 'run' : 'runs'}
        </p>
      </div>
      <div className="shrink-0 text-right font-mono text-xs">
        <p className="font-bold text-purple-300">{entry.accuracy}%</p>
        <p className="text-slate-500">best {entry.bestRun}</p>
        {entry.fastestRunSeconds != null && (
          <p className="text-slate-600">{formatTime(entry.fastestRunSeconds)}</p>
        )}
      </div>
    </li>
  );
}
