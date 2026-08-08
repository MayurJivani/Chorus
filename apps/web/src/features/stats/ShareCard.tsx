import { useState } from 'react';
import type { StatsResponse } from '../../types/api';
import { formatDuration } from './formatDuration';

interface ShareCardProps {
  stats: StatsResponse;
}

function buildStatsShareText(stats: StatsResponse): string {
  const winRate =
    stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;

  const lines = [
    'Chorus stats 🎵',
    `🔥 ${stats.currentStreak} day streak (best ${stats.maxStreak})`,
    `${winRate}% win rate over ${stats.gamesPlayed} games`,
  ];

  // Only worth bragging about once there is a real time behind it.
  if (stats.fastestSolveSeconds != null) {
    lines.push(`⚡ Fastest solve ${formatDuration(stats.fastestSolveSeconds)}`);
  }
  if (stats.averageGuessesPerWin != null) {
    lines.push(`🎯 ${stats.averageGuessesPerWin} guesses per win on average`);
  }

  return lines.join('\n');
}

export function ShareCard({ stats }: ShareCardProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const text = buildStatsShareText(stats);
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button type="button" onClick={handleShare} className="btn-primary w-full !rounded-xl">
      {copied ? '✓ Copied!' : 'Share my stats'}
    </button>
  );
}
