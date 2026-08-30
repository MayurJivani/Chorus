/**
 * End-to-end smoke test for live duel matchmaking, run against a running dev server.
 *
 * Exercises the parts the unit tests deliberately mock out: real session cookies, the real
 * WebSocket upgrade, and the real room the matchmaker creates. Not part of the suite — it needs
 * a live server and talks to Deezer.
 *
 *   npx tsx apps/server/src/scripts/duel-e2e.ts
 *
 * ⚠ This registers real accounts and writes real ratings. Run once against a real database and
 * it puts fake players on the public ratings board — which is exactly what happened the first
 * time, hence the guard below. It refuses anything but a `_test` database, matching the rule
 * the rest of the suite already follows.
 */
import { WebSocket } from 'ws';

function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  const name = url.split('/').pop()?.split('?')[0] ?? '';
  if (!name.endsWith('_test')) {
    console.error(
      `Refusing to run: DATABASE_URL points at "${name || '(unset)'}", not a _test database.\n` +
        'This script creates accounts and rated duels — pointing it at real data leaves fake\n' +
        'players on the ratings board. Start a server against <db>_test and retry.',
    );
    process.exit(1);
  }
}

const API = process.env.E2E_API ?? 'http://localhost:8888';
const WS_URL = API.replace(/^http/, 'ws') + '/ws';

interface Session {
  label: string;
  cookie: string;
}

/**
 * A cookie jar keyed by name, last value winning.
 *
 * The csrf endpoint sets `chorusify_csrf` more than once in a single response; appending every
 * Set-Cookie to a list meant the stale one went back out first and the server rejected the
 * token as invalid.
 */
function absorb(jar: Map<string, string>, res: Response): void {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [name, ...rest] = raw.split(';')[0]!.split('=');
    if (name) jar.set(name, rest.join('='));
  }
}

const jarHeader = (jar: Map<string, string>) => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

async function registerOrLogin(label: string): Promise<Session> {
  const email = `duel-${label}-${Date.now()}@example.test`;
  const jar = new Map<string, string>();

  const csrfRes = await fetch(`${API}/api/csrf-token`);
  absorb(jar, csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const res = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      cookie: jarHeader(jar),
    },
    body: JSON.stringify({ email, password: 'hunter2hunter2', displayName: label }),
  });
  if (!res.ok) throw new Error(`register ${label} failed: ${res.status} ${await res.text()}`);
  absorb(jar, res);

  return { label, cookie: jarHeader(jar) };
}

function connect(
  session: Session,
): Promise<{ ws: WebSocket; messages: Record<string, unknown>[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, { headers: { cookie: session.cookie } });
    const messages: Record<string, unknown>[] = [];
    ws.on('message', (data) => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch {
        /* ignore */
      }
    });
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('error', reject);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function find(messages: Record<string, unknown>[], type: string) {
  return messages.find((m) => m.type === type);
}

async function main() {
  assertTestDatabase();

  // Sequential: the two registrations each fetch their own CSRF token, and running them at the
  // same time had them racing over the same cookie jar.
  console.log('registering two accounts…');
  const a = await registerOrLogin('AdaDuel');
  const b = await registerOrLogin('BlakeDuel');

  console.log('connecting both sockets…');
  const ca = await connect(a);
  const cb = await connect(b);

  // Watch first, so we can see the counts move.
  ca.ws.send(JSON.stringify({ type: 'duel_queue_watch' }));
  cb.ws.send(JSON.stringify({ type: 'duel_queue_watch' }));
  await wait(300);

  console.log('A queues for artist 412…');
  ca.ws.send(JSON.stringify({ type: 'duel_queue_join', artistId: 412 }));
  await wait(1500);

  const queued = find(ca.messages, 'duel_queued');
  console.log('  A queued:', queued ? '✓' : '✗');

  const counts = [...cb.messages].reverse().find((m) => m.type === 'duel_queue_counts');
  console.log('  B sees counts:', JSON.stringify(counts?.counts));

  console.log('B queues for the SAME artist…');
  cb.ws.send(JSON.stringify({ type: 'duel_queue_join', artistId: 412 }));
  await wait(4000);

  const matchedA = find(ca.messages, 'duel_matched') as { code?: string } | undefined;
  const matchedB = find(cb.messages, 'duel_matched') as { code?: string } | undefined;
  console.log('  A matched:', matchedA?.code ?? '✗');
  console.log('  B matched:', matchedB?.code ?? '✗');
  console.log('  same room:', matchedA?.code && matchedA.code === matchedB?.code ? '✓' : '✗');

  if (!matchedA?.code) {
    console.log('  A messages:', ca.messages.map((m) => m.type).join(', '));
    process.exit(1);
  }

  // Both join the room; a duel should auto-start with no host pressing anything.
  console.log('both join the duel room…');
  ca.ws.send(JSON.stringify({ type: 'join_room', code: matchedA.code }));
  await wait(400);
  cb.ws.send(JSON.stringify({ type: 'join_room', code: matchedA.code }));
  await wait(6000);

  const state = [...ca.messages].reverse().find((m) => m.type === 'room_state') as
    { room?: { isDuel?: boolean; players?: unknown[] } } | undefined;
  console.log('  room isDuel:', state?.room?.isDuel ? '✓' : '✗');
  console.log('  players in room:', state?.room?.players?.length ?? 0);

  const started = find(ca.messages, 'round_start') as { totalRounds?: number } | undefined;
  console.log(
    '  auto-started without a host:',
    started ? `✓ (${started.totalRounds} rounds)` : '✗',
  );

  // Now the forfeit rule: A walks out mid-duel, B should win.
  console.log('A leaves mid-duel…');
  ca.ws.close();
  await wait(2500);

  const forfeit = find(cb.messages, 'duel_forfeit');
  const result = find(cb.messages, 'duel_result') as { duel?: Record<string, unknown> } | undefined;
  console.log('  B told about forfeit:', forfeit ? '✓' : '✗');
  console.log(
    '  duel recorded:',
    result?.duel
      ? `✓ winner=${result.duel.winnerId} forfeited=${result.duel.forfeited}`
      : '✗ (not settled)',
  );

  cb.ws.close();
  process.exit(started && forfeit && result ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
