import { useState } from 'react';
import type { StatsResponse } from '../../types/api';

interface ShareCardProps {
  stats: StatsResponse;
}

function buildStatsShareText(stats: StatsResponse): string {
  const winRate =
    stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
  return `Chorus stats 🎵\n🔥 ${stats.currentStreak} day streak (best ${stats.maxStreak})\n${winRate}% win rate over ${stats.gamesPlayed} games`;
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
