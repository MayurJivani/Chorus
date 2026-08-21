import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/client';
import { sessions } from '../db/schema';
import { env } from '../env';
import { generateCsrfToken } from '../middleware/csrf';
import { logger } from '../logger';

export interface RequestSession {
  id: string; // hashed token, primary key of the sessions row
  userId: string | null;
  guestId: string;
  expiresAt: Date;
}

export const SESSION_COOKIE_NAME = 'chorusify_sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Resolves a raw session token (e.g. from a cookie header on a WebSocket upgrade) back to a
 * valid session, or null when it's missing/expired. Shared by sessionMiddleware and ws.ts. */
export async function getSessionFromToken(token: string): Promise<RequestSession | null> {
  const hashed = hashToken(token);
  const rows = await db.select().from(sessions).where(eq(sessions.id, hashed)).limit(1);
  const row = rows[0];
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return {
    id: row.id,
    userId: row.userId,
    guestId: row.guestId,
    expiresAt: row.expiresAt,
  };
}

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeMs,
  };
}

function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE_NAME, token, cookieOptions(expiresAt.getTime() - Date.now()));
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

async function insertSession(
  userId: string | null,
  guestId: string,
): Promise<{ token: string; session: RequestSession }> {
  const token = generateToken();
  const id = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({ id, userId, guestId, expiresAt });

  return { token, session: { id, userId, guestId, expiresAt } };
}

/**
 * Ensures every request has a valid session, transparently issuing an
 * anonymous guest session when no valid cookie is present. This keeps guest
 * play frictionless while giving CSRF protection a stable session identifier
 * to bind against on every request.
 */
export async function sessionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;

  if (token) {
    const hashed = hashToken(token);
    const rows = await db.select().from(sessions).where(eq(sessions.id, hashed)).limit(1);
    const row = rows[0];

    if (row && row.expiresAt.getTime() > Date.now()) {
      req.session = {
        id: row.id,
        userId: row.userId,
        guestId: row.guestId,
        expiresAt: row.expiresAt,
      };
      next();
      return;
    }

    // Stale/expired/unknown token — clean up if the row exists, then fall through to issuing a new one.
    if (row) {
      await db.delete(sessions).where(eq(sessions.id, hashed));
    }
  }

  req.session = await issueGuestSession(res);
  // The CSRF cookie is bound to the session id. This is a *silent* session issuance (no
  // cookie the caller sent was valid), so whatever CSRF cookie the browser is holding — if
  // any — is now stale too; regenerate it here rather than leaving the client to discover
  // the mismatch on its next state-changing request.
  generateCsrfToken(req, res, { overwrite: true });
  next();
}

/** Issues a brand-new anonymous session and sets its cookie. Used both as the sessionMiddleware
 * fallback and explicitly after logout, so the response always leaves the client with a session
 * (and therefore a CSRF pairing) that's actually valid for the next request. */
export async function issueGuestSession(res: Response): Promise<RequestSession> {
  const { token, session } = await insertSession(null, randomUUID());
  setSessionCookie(res, token, session.expiresAt);
  return session;
}

/**
 * Rotates the session on privilege change (login/register) to prevent session fixation.
 *
 * Note: the CSRF double-submit cookie is cryptographically bound to the session id at the
 * time it was issued. Rotating the session here invalidates any CSRF token the client is
 * currently holding — callers MUST also regenerate the CSRF token (see `generateCsrfToken`
 * in middleware/csrf.ts) and return it in the response body after calling this.
 */
export async function bindUserToSession(
  req: Request,
  res: Response,
  userId: string,
): Promise<RequestSession> {
  await db.delete(sessions).where(eq(sessions.id, req.session.id));
  const { token, session } = await insertSession(userId, req.session.guestId);
  setSessionCookie(res, token, session.expiresAt);
  req.session = session;
  return session;
}

/**
 * Deletes sessions past their expiry. Returns how many were removed.
 *
 * Expired rows were previously only cleaned up if someone happened to present that exact
 * stale token again — which for an abandoned guest session never happens. Since a request
 * arriving without a valid cookie silently mints a new guest session, anything hitting the
 * API without cookie support (crawlers, uptime checks, scripted traffic) added a row per
 * request that then sat in the table indefinitely. This makes the table self-limiting.
 */
export async function deleteExpiredSessions(): Promise<number> {
  const removed = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });

  if (removed.length > 0) {
    logger.info({ removed: removed.length }, 'Deleted expired sessions');
  }
  return removed.length;
}

const SESSION_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Runs the expiry sweep at startup and every six hours after. Unref'd so it never holds the
 *  process open during shutdown. */
export function startSessionSweep(): NodeJS.Timeout {
  const sweep = (): void => {
    void deleteExpiredSessions().catch((err) =>
      logger.error({ err }, 'Expired session sweep failed'),
    );
  };

  sweep();
  const timer = setInterval(sweep, SESSION_SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}

/** Ends the current session and immediately issues a fresh guest session so the response
 * leaves the client with a valid session/CSRF pairing rather than a dangling stale one. */
export async function destroySession(req: Request, res: Response): Promise<RequestSession> {
  await db.delete(sessions).where(eq(sessions.id, req.session.id));
  clearSessionCookie(res);
  req.session = await issueGuestSession(res);
  return req.session;
}
