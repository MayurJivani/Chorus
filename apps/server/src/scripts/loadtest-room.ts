/**
 * Ramps real WebSocket clients into one multiplayer room and reports where it degrades.
 *
 *   npx tsx apps/server/src/scripts/loadtest-room.ts [players] [origin]
 *   npx tsx apps/server/src/scripts/loadtest-room.ts 2000 http://127.0.0.1:8888
 *
 * The streamer question: one host, one room, an audience arriving at once. Rooms are in-memory
 * in a single process, so every player added costs CPU and memory on the same thread that has
 * to get the next round out on time.
 *
 * What it measures, and why each one is a separate number:
 *
 *   join        how long the room takes to absorb the audience. A stream link is a stampede,
 *               not a trickle, and each join does a session lookup before it touches the room.
 *   fanout      wall time from the host pressing start to the last client holding round_start.
 *               This is the number that decides whether a round feels simultaneous.
 *   guess storm every client answering at once. Each guess triggers a scores broadcast, so this
 *               is where an O(N^2) broadcast used to bite hardest.
 *
 * Deliberately points at a local server by default. Pointing it at production would put a
 * synthetic audience in front of real players.
 */
import { WebSocket } from 'ws';

const PLAYERS = Number(process.argv[2] ?? 500);
const ORIGIN = process.argv[3] ?? 'http://127.0.0.1:8888';
const WS_URL = ORIGIN.replace(/^http/, 'ws') + '/ws';

/** Ramped rather than opened all at once: the point is to find the ceiling, not to SYN flood. */
const CONNECT_BATCH = 100;
const BATCH_PAUSE_MS = 40;

interface Client {
  ws: WebSocket;
  id: number;
  sawRoundStart: number | null;
  /** Learned from the server: joins race within a batch, so client order is not join order. */
  selfId: string | null;
  hostId: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (xs: number[], p: number) =>
  xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)]! : 0;

/**
 * A guest session, which is what a viewer clicking a stream link gets.
 *
 * Returns the whole cookie header plus the CSRF value: writes use double-submit, so the token
 * has to travel as a header as well as a cookie.
 */
async function session(): Promise<{ cookie: string; csrf: string }> {
  const res = await fetch(`${ORIGIN}/api/categories`);
  const raw = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]!);
  const sid = raw.find((c) => c.startsWith('chorusify_sid='));
  // The name is host-prefixed under HTTPS and plain over local HTTP.
  const csrfCookie = raw.find((c) => c.includes('csrf'));
  if (!sid || !csrfCookie) throw new Error('No session cookies from the server');
  return { cookie: [sid, csrfCookie].join('; '), csrf: csrfCookie.split('=').slice(1).join('=') };
}

async function connect(cookie: string, id: number): Promise<Client> {
  const ws = new WebSocket(WS_URL, { headers: { Cookie: cookie, Origin: ORIGIN } });
  const client: Client = { ws, id, sawRoundStart: null, selfId: null, hostId: null };
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  ws.on('message', (data) => {
    const text = data.toString();
    // Only the arrival time matters; parsing every frame would measure the harness.
    if (text.includes('"round_start"') && client.sawRoundStart === null) {
      client.sawRoundStart = performance.now();
    }
    // An error reaching only the host is invisible otherwise, and "0 clients saw round_start"
    // looks identical to a fanout collapse.
    if (text.includes('"error"') && client.id === 0)
      console.log(`\n  host error: ${text.slice(0, 160)}`);
    if (client.selfId === null || client.hostId === null) {
      try {
        const msg = JSON.parse(text) as { selfId?: string; room?: { hostId?: string } };
        if (msg.selfId) client.selfId = msg.selfId;
        if (msg.room?.hostId) client.hostId = msg.room.hostId;
      } catch {
        /* not every frame is one we need to read */
      }
    }
  });
  return client;
}

async function main() {
  console.log(`Ramping ${PLAYERS} clients into one room at ${ORIGIN}\n`);

  const host0 = await session();
  const created = await fetch(`${ORIGIN}/api/multiplayer/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: host0.cookie,
      'x-csrf-token': host0.csrf,
      Origin: ORIGIN,
    },
    body: JSON.stringify({ categoryId: 'decade-2010s', guessMode: 'choice', rounds: 3 }),
  });
  if (!created.ok) throw new Error(`Room create failed: ${created.status} ${await created.text()}`);
  const { code } = (await created.json()) as { code: string };
  console.log(`room ${code}`);

  const clients: Client[] = [];
  const joinMs: number[] = [];
  const startedRamp = performance.now();

  for (let i = 0; i < PLAYERS; i += CONNECT_BATCH) {
    const batch = await Promise.allSettled(
      Array.from({ length: Math.min(CONNECT_BATCH, PLAYERS - i) }, async (_, k) => {
        const t0 = performance.now();
        const { cookie } = await session();
        const c = await connect(cookie, i + k);
        c.ws.send(JSON.stringify({ type: 'join_room', code, nickname: `L${i + k}` }));
        joinMs.push(performance.now() - t0);
        return c;
      }),
    );
    for (const r of batch) if (r.status === 'fulfilled') clients.push(r.value);
    process.stdout.write(`\r  connected ${clients.length}/${PLAYERS}`);
    await sleep(BATCH_PAUSE_MS);
  }

  const rampMs = performance.now() - startedRamp;
  console.log(
    `\n  ramp ${(rampMs / 1000).toFixed(1)}s · join p50 ${pct(joinMs, 0.5).toFixed(0)}ms · p99 ${pct(joinMs, 0.99).toFixed(0)}ms · failed ${PLAYERS - clients.length}\n`,
  );
  await sleep(1000);

  // Whoever the server made host, not whoever this script connected first.
  const hostId = clients.find((c) => c.hostId)?.hostId ?? null;
  const host = clients.find((c) => c.selfId && c.selfId === hostId) ?? clients[0];
  if (!host) throw new Error('No clients connected');
  const startedAt = performance.now();
  host.ws.send(JSON.stringify({ type: 'start_game' }));

  // Generous: the interesting result is how long the tail takes, not whether it eventually lands.
  await sleep(Math.max(6000, PLAYERS));
  const got = clients.filter((c) => c.sawRoundStart !== null);
  const fanout = got.map((c) => c.sawRoundStart! - startedAt);
  console.log(
    `  round_start reached ${got.length}/${clients.length} · p50 ${pct(fanout, 0.5).toFixed(0)}ms · p99 ${pct(fanout, 0.99).toFixed(0)}ms · max ${Math.max(0, ...fanout).toFixed(0)}ms`,
  );

  const stormAt = performance.now();
  for (const c of clients) c.ws.send(JSON.stringify({ type: 'guess', trackId: '__pass__' }));
  await sleep(Math.max(5000, PLAYERS));
  console.log(`  guess storm settled in ${(performance.now() - stormAt).toFixed(0)}ms\n`);

  for (const c of clients) c.ws.close();
  console.log('Read fanout p99 first: that is whether a round starts together for everyone.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
