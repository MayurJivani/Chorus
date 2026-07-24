/** Simple deterministic string hash (djb2) — good enough for picking a stable, non-secret index. */
export function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash);
}

/** Deterministic Fisher-Yates shuffle seeded by a string — same seed always yields the same
 * order, but different seeds spread out unpredictably. Used to pick (and order) a stable
 * subset of items — e.g. "these 10 tracks, in this order, for this artist on this date." */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  let state = hashString(seed) || 1; // xorshift32 needs a non-zero seed

  const next = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }

  return result;
}
