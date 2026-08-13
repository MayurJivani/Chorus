/**
 * Human-readable duration from a number of seconds.
 *
 * Solve times span a wide range — a few seconds when the first snippet is recognised, tens of
 * minutes of total play once someone has a streak going — so a single unit reads badly at one
 * end or the other. Sub-minute values keep one decimal because the difference between 4.2s and
 * 4.9s is the interesting part of a "fastest solve".
 */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '-';
  if (seconds < 60) {
    const rounded = Math.round(seconds * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}s`;
  }

  const wholeSeconds = Math.round(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${secs}s`;
}
