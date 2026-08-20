/**
 * Achievements, derived rather than awarded.
 *
 * Each one is a predicate over what a player has already done, evaluated on request. Nothing is
 * written when an achievement is earned, so there is no unlock event to miss, no backfill to
 * run, and no possibility of the stored list disagreeing with the record it claims to describe.
 * A player who earned something before it existed simply has it.
 *
 * Every threshold is absolute. "Name 100 songs" is achievable and legible on day one; "be in the
 * top 1%" depends on how many other people happen to be playing, which is not an achievement so
 * much as a statement about the population.
 */
import type { ProgressSummary } from './progressService';

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface AchievementDef {
  id: string;
  label: string;
  /** What to do to get it, phrased as an instruction rather than a boast. */
  description: string;
  tier: AchievementTier;
  /** How far along the player is, 0 to 1. Earned when it reaches 1. */
  measure: (p: ProgressSummary) => { current: number; target: number };
}

/** Total songs named across every mode, which is the closest thing to "how much have you played". */
function totalSongs(p: ProgressSummary): number {
  return (
    p.byMode.artist.songsCorrect +
    p.byMode.category.songsCorrect +
    p.byMode.era.songsCorrect +
    p.survival.totalSongs
  );
}

function countTo(current: number, target: number) {
  return { current, target };
}

/**
 * The catalogue.
 *
 * Deliberately spread across modes so that no single way of playing unlocks everything, and
 * weighted toward things a player can reach by simply continuing rather than by grinding one
 * number.
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-song',
    label: 'First blood',
    description: 'Name your first song',
    tier: 'bronze',
    measure: (p) => countTo(totalSongs(p), 1),
  },
  {
    id: 'songs-100',
    label: 'Century',
    description: 'Name 100 songs',
    tier: 'silver',
    measure: (p) => countTo(totalSongs(p), 100),
  },
  {
    id: 'songs-500',
    label: 'Encyclopaedia',
    description: 'Name 500 songs',
    tier: 'gold',
    measure: (p) => countTo(totalSongs(p), 500),
  },
  {
    id: 'perfect-run',
    label: 'Clean sweep',
    description: 'Get every song in a single run',
    tier: 'gold',
    // Read off the best run of any artist or category, since that is where a full run happens.
    measure: (p) => {
      const best = p.mastery.reduce((max, m) => Math.max(max, m.bestRun), 0);
      const target = p.mastery.reduce(
        (max, m) => Math.max(max, m.runs > 0 ? Math.round(m.songsPossible / m.runs) : 0),
        10,
      );
      return countTo(best, target);
    },
  },
  {
    id: 'survivor-10',
    label: 'Still standing',
    description: 'Reach a streak of 10 in Survival',
    tier: 'silver',
    measure: (p) => countTo(p.survival.bestStreak, 10),
  },
  {
    id: 'survivor-25',
    label: 'Unstoppable',
    description: 'Reach a streak of 25 in Survival',
    tier: 'gold',
    measure: (p) => countTo(p.survival.bestStreak, 25),
  },
  {
    id: 'daily-7',
    label: 'Regular',
    description: 'Win 7 daily challenges',
    tier: 'bronze',
    measure: (p) => countTo(p.daily.won, 7),
  },
  {
    id: 'daily-30',
    label: 'Devoted',
    description: 'Win 30 daily challenges',
    tier: 'gold',
    measure: (p) => countTo(p.daily.won, 30),
  },
  {
    id: 'superfan',
    label: 'Superfan',
    description: 'Name 50 songs by a single artist',
    tier: 'gold',
    measure: (p) => {
      const best = p.mastery
        .filter((m) => m.sourceType === 'artist')
        .reduce((max, m) => Math.max(max, m.songsCorrect), 0);
      return countTo(best, 50);
    },
  },
  {
    id: 'explorer',
    label: 'Explorer',
    description: 'Play 10 different artists or categories',
    tier: 'silver',
    measure: (p) => countTo(p.mastery.length, 10),
  },
  {
    id: 'time-traveller',
    label: 'Time traveller',
    description: 'Finish a run in Guess the Year',
    tier: 'bronze',
    measure: (p) => countTo(p.byMode.era.runs, 1),
  },
  {
    id: 'duellist',
    label: 'Duellist',
    description: 'Win a rated duel',
    tier: 'silver',
    measure: (p) => countTo(p.duels.won, 1),
  },
  {
    id: 'level-10',
    label: 'Seasoned',
    description: 'Reach level 10',
    tier: 'silver',
    measure: (p) => countTo(p.level.level, 10),
  },
];

export interface AchievementView {
  id: string;
  label: string;
  description: string;
  tier: AchievementTier;
  earned: boolean;
  current: number;
  target: number;
  /** 0 to 1, capped, so a bar never overshoots once the threshold is passed. */
  progress: number;
}

export function evaluateAchievements(progress: ProgressSummary): AchievementView[] {
  return ACHIEVEMENTS.map((def) => {
    const { current, target } = def.measure(progress);
    const safeTarget = Math.max(1, target);
    return {
      id: def.id,
      label: def.label,
      description: def.description,
      tier: def.tier,
      earned: current >= safeTarget,
      current,
      target: safeTarget,
      progress: Math.min(1, current / safeTarget),
    };
  });
}

/** Earned first, then whatever the player is closest to, so the list leads with what is in reach. */
export function sortAchievements(views: AchievementView[]): AchievementView[] {
  return [...views].sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    return b.progress - a.progress;
  });
}
