import { useEffect, useState } from 'react';

/** Ticking "seconds remaining" until a target epoch time (ms). Clamps at 0. */
export function useCountdownTo(targetEpoch: number | null, intervalMs = 500): number {
  const [remaining, setRemaining] = useState(() =>
    targetEpoch == null ? 0 : Math.max(0, Math.floor((targetEpoch - Date.now()) / 1000)),
  );

  useEffect(() => {
    if (targetEpoch == null) return;
    const update = () => setRemaining(Math.max(0, Math.floor((targetEpoch - Date.now()) / 1000)));
    update();
    const interval = setInterval(update, intervalMs);
    return () => clearInterval(interval);
  }, [targetEpoch, intervalMs]);

  return remaining;
}
