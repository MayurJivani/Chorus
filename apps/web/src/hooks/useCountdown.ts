import { useEffect, useState } from 'react';

function msUntilNextUtcMidnight(): number {
  const now = new Date();
  const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return nextMidnight - now.getTime();
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Ticking countdown string to the next daily puzzle (UTC midnight). */
export function useCountdownToNextPuzzle(): string {
  const [remaining, setRemaining] = useState(() => msUntilNextUtcMidnight());

  useEffect(() => {
    const interval = setInterval(() => setRemaining(msUntilNextUtcMidnight()), 1000);
    return () => clearInterval(interval);
  }, []);

  return formatDuration(remaining);
}
