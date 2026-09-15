/**
 * Measures what a broadcast costs as a room grows.
 *
 *   npx tsx apps/server/src/scripts/bench-broadcast.ts
 *
 * The question this answers: can one room hold a streamer's audience? Rooms are in-memory in a
 * single process, so every player added costs CPU on the same thread that has to get the next
 * round out on time.
 *
 * Two shapes are compared, because the difference between them is the whole ceiling:
 *
 *   per-player  every player gets their own JSON.stringify, which is what a per-player field
 *               like `selfId` forces. With a scoreboard carrying one entry per player, the
 *               payload also grows with the room, so the work is O(N^2).
 *   shared      the payload is serialised once and the same string is written to every socket.
 *               Still O(N) writes, but the serialisation no longer multiplies.
 *
 * No database and no sockets: this isolates the serialisation, which is the part that scales
 * badly. Real socket writes add cost on top, but they are linear and the kernel absorbs them.
 */

interface ScoreEntry {
  playerId: string;
  displayName: string;
  score: number;
  totalAnswerMs: number;
  answered: boolean;
  correctThisRound: boolean | null;
  stageIndex: number;
}

function makeScores(n: number): ScoreEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    playerId: `player-${i}-0123456789abcdef`,
    displayName: `Player ${i}`,
    score: (i * 37) % 500,
    totalAnswerMs: (i * 811) % 30000,
    answered: i % 3 === 0,
    correctThisRound: i % 4 === 0 ? true : null,
    stageIndex: i % 5,
  }));
}

function bench(label: string, fn: () => void): number {
  // One warm pass so the JIT is not being measured instead of the work.
  fn();
  const started = process.hrtime.bigint();
  fn();
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`  ${label.padEnd(14)} ${ms.toFixed(1)} ms`);
  return ms;
}

function main() {
  const sizes = [100, 500, 1000, 2500, 5000, 10000];
  console.log('One "scores" broadcast, by room size:\n');

  for (const n of sizes) {
    const scores = makeScores(n);
    const payload = { type: 'scores', scores };
    console.log(`${n} players`);

    // What the code does today: selfId differs per player, so nothing can be reused.
    const perPlayer = bench('per-player', () => {
      for (let i = 0; i < n; i++) {
        JSON.stringify({ selfId: `player-${i}-0123456789abcdef`, ...payload });
      }
    });

    // Serialise once, write the same bytes to everyone.
    const shared = bench('shared', () => {
      const once = JSON.stringify(payload);
      for (let i = 0; i < n; i++) {
        // Represents the socket write, which still happens per player.
        if (once.length === -1) throw new Error('unreachable');
      }
    });

    console.log(`  ${'speedup'.padEnd(14)} ${(perPlayer / Math.max(shared, 0.001)).toFixed(0)}x\n`);
  }

  console.log('Read the per-player column against room size: it grows faster than linearly,');
  console.log('because the payload itself carries one entry per player. That is the ceiling.');
}

main();
