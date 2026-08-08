import { describe, it, expect, beforeEach } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../../src/db/client';
import { sessions } from '../../src/db/schema';
import { deleteExpiredSessions } from '../../src/auth/session';

async function seedSession(expiresAt: Date) {
  const id = createHash('sha256').update(randomBytes(32)).digest('hex');
  await db.insert(sessions).values({ id, userId: null, guestId: randomUUID(), expiresAt });
  return id;
}

beforeEach(async () => {
  await db.delete(sessions);
});

describe('deleteExpiredSessions', () => {
  it('removes expired sessions and keeps live ones', async () => {
    const expired = await seedSession(new Date(Date.now() - 60_000));
    const live = await seedSession(new Date(Date.now() + 60_000));

    const removed = await deleteExpiredSessions();

    expect(removed).toBe(1);
    const remaining = await db.select({ id: sessions.id }).from(sessions);
    expect(remaining.map((r) => r.id)).toEqual([live]);
    expect(remaining.map((r) => r.id)).not.toContain(expired);
  });

  it('is a no-op when nothing has expired', async () => {
    await seedSession(new Date(Date.now() + 60_000));
    expect(await deleteExpiredSessions()).toBe(0);
    expect(await db.select().from(sessions)).toHaveLength(1);
  });

  it('reclaims the abandoned guest sessions that used to accumulate forever', async () => {
    // A cookieless client mints one row per request; none are ever presented again.
    for (let i = 0; i < 25; i += 1) await seedSession(new Date(Date.now() - 1000));

    expect(await deleteExpiredSessions()).toBe(25);
    expect(await db.select().from(sessions)).toHaveLength(0);
  });
});
