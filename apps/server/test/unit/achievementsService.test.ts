import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENTS,
  evaluateAchievements,
  sortAchievements,
} from '../../src/services/achievementsService';
import type { ProgressSummary } from '../../src/services/progressService';
import { levelForXp } from '../../src/services/progressService';

const emptyMode = () => ({ songsCorrect: 0, songsPossible: 0, accuracy: 0, runs: 0 });

/** A progress snapshot with nothing played, which each test bends into the shape it needs. */
function snapshot(overrides: Partial<ProgressSummary> = {}): ProgressSummary {
  return {
    level: levelForXp(0),
    sources: { songs: 0, dailyWins: 0, duelWins: 0, survival: 0 },
    byMode: { artist: emptyMode(), category: emptyMode(), era: emptyMode() },
    byCategoryGroup: {},
    survival: { runs: 0, bestStreak: 0, totalSongs: 0 },
    daily: { played: 0, won: 0 },
    duels: { played: 0, won: 0, rating: null },
    mastery: [],
    ...overrides,
  };
}

function find(views: ReturnType<typeof evaluateAchievements>, id: string) {
  const view = views.find((v) => v.id === id);
  if (!view) throw new Error(`No achievement ${id}`);
  return view;
}

describe('the catalogue', () => {
  it('has unique ids, since they key the UI', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('describes every achievement as something to do', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.label).toBeTruthy();
      expect(a.description).toBeTruthy();
      expect(['bronze', 'silver', 'gold']).toContain(a.tier);
    }
  });

  it('spreads across modes so one way of playing cannot unlock everything', () => {
    // Every achievement earned by a player who only ever played Artist Mode.
    const artistOnly = snapshot({
      byMode: {
        artist: { songsCorrect: 9999, songsPossible: 9999, accuracy: 100, runs: 999 },
        category: emptyMode(),
        era: emptyMode(),
      },
      mastery: Array.from({ length: 30 }, (_, i) => ({
        sourceType: 'artist',
        sourceId: `${i}`,
        label: `A${i}`,
        runs: 10,
        songsCorrect: 100,
        songsPossible: 100,
        accuracy: 100,
        bestRun: 10,
        fastestRunSeconds: 40,
      })),
      level: levelForXp(999999),
    });

    const unearned = evaluateAchievements(artistOnly).filter((v) => !v.earned);
    expect(unearned.length).toBeGreaterThan(0);
  });
});

describe('evaluateAchievements', () => {
  it('earns nothing on an empty record', () => {
    const views = evaluateAchievements(snapshot());

    expect(views.every((v) => !v.earned)).toBe(true);
    // Not all-zero: levels start at 1, so "reach level 10" is honestly a tenth done before
    // anyone plays. What matters is that nothing is complete.
    expect(views.every((v) => v.progress < 1)).toBe(true);
  });

  it('earns the first song from any mode, including Survival', () => {
    const fromSurvival = snapshot({ survival: { runs: 1, bestStreak: 3, totalSongs: 3 } });
    expect(find(evaluateAchievements(fromSurvival), 'first-song').earned).toBe(true);

    const fromEra = snapshot({
      byMode: {
        artist: emptyMode(),
        category: emptyMode(),
        era: { songsCorrect: 2, songsPossible: 10, accuracy: 20, runs: 1 },
      },
    });
    expect(find(evaluateAchievements(fromEra), 'first-song').earned).toBe(true);
  });

  it('reports partial progress toward a threshold', () => {
    const halfway = snapshot({ daily: { played: 10, won: 15 } });
    const view = find(evaluateAchievements(halfway), 'daily-30');

    expect(view.earned).toBe(false);
    expect(view.progress).toBeCloseTo(0.5, 5);
    expect(view.current).toBe(15);
    expect(view.target).toBe(30);
  });

  it('caps progress at one so a bar cannot overshoot', () => {
    const far = snapshot({ survival: { runs: 9, bestStreak: 200, totalSongs: 400 } });
    const view = find(evaluateAchievements(far), 'survivor-10');

    expect(view.earned).toBe(true);
    expect(view.progress).toBe(1);
    // The raw figure is still reported, so the UI can say 200 rather than pretending it is 10.
    expect(view.current).toBe(200);
  });

  it('awards Superfan for one artist, not a total spread across many', () => {
    const spread = snapshot({
      mastery: Array.from({ length: 10 }, (_, i) => ({
        sourceType: 'artist',
        sourceId: `${i}`,
        label: `A${i}`,
        runs: 1,
        songsCorrect: 9,
        songsPossible: 10,
        accuracy: 90,
        bestRun: 9,
        fastestRunSeconds: 50,
      })),
    });
    // 90 songs named, but never more than 9 for any one artist.
    expect(find(evaluateAchievements(spread), 'superfan').earned).toBe(false);

    const devoted = snapshot({
      mastery: [
        {
          sourceType: 'artist',
          sourceId: '412',
          label: 'Queen',
          runs: 6,
          songsCorrect: 55,
          songsPossible: 60,
          accuracy: 92,
          bestRun: 10,
          fastestRunSeconds: 44,
        },
      ],
    });
    expect(find(evaluateAchievements(devoted), 'superfan').earned).toBe(true);
  });

  it('does not award Superfan for a category, which is nobody’s fandom', () => {
    const category = snapshot({
      mastery: [
        {
          sourceType: 'category',
          sourceId: 'year-2020',
          label: 'Top Hits 2020',
          runs: 8,
          songsCorrect: 70,
          songsPossible: 80,
          accuracy: 88,
          bestRun: 10,
          fastestRunSeconds: 50,
        },
      ],
    });
    expect(find(evaluateAchievements(category), 'superfan').earned).toBe(false);
  });

  it('awards a clean sweep only for a run with nothing missed', () => {
    const nearly = snapshot({
      mastery: [
        {
          sourceType: 'artist',
          sourceId: '1',
          label: 'A',
          runs: 1,
          songsCorrect: 9,
          songsPossible: 10,
          accuracy: 90,
          bestRun: 9,
          fastestRunSeconds: 60,
        },
      ],
    });
    expect(find(evaluateAchievements(nearly), 'perfect-run').earned).toBe(false);

    const perfect = snapshot({
      mastery: [
        {
          sourceType: 'artist',
          sourceId: '1',
          label: 'A',
          runs: 1,
          songsCorrect: 10,
          songsPossible: 10,
          accuracy: 100,
          bestRun: 10,
          fastestRunSeconds: 60,
        },
      ],
    });
    expect(find(evaluateAchievements(perfect), 'perfect-run').earned).toBe(true);
  });

  it('counts distinct artists and categories for Explorer', () => {
    const wide = snapshot({
      mastery: Array.from({ length: 10 }, (_, i) => ({
        sourceType: i % 2 ? 'artist' : 'category',
        sourceId: `${i}`,
        label: `S${i}`,
        runs: 1,
        songsCorrect: 1,
        songsPossible: 10,
        accuracy: 10,
        bestRun: 1,
        fastestRunSeconds: null,
      })),
    });
    expect(find(evaluateAchievements(wide), 'explorer').earned).toBe(true);
  });
});

describe('sortAchievements', () => {
  it('leads with what is earned, then with what is closest', () => {
    const views = sortAchievements(
      evaluateAchievements(
        snapshot({
          survival: { runs: 3, bestStreak: 12, totalSongs: 20 },
          daily: { played: 6, won: 6 },
        }),
      ),
    );

    const firstUnearned = views.findIndex((v) => !v.earned);
    expect(views.slice(0, firstUnearned).every((v) => v.earned)).toBe(true);

    const unearned = views.slice(firstUnearned);
    for (let i = 1; i < unearned.length; i += 1) {
      expect(unearned[i - 1]!.progress).toBeGreaterThanOrEqual(unearned[i]!.progress);
    }
  });
});
