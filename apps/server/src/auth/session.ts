import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/client';
import { sessions } from '../db/schema';
import { env } from '../env';
import { generateCsrfToken } from '../middleware/csrf';

export interface RequestSession {
  id: string; // hashed token, primary key of the sessions row
  userId: string | null;
  guestId: string;
  expiresAt: Date;
}

const SESSION_COOKIE_NAME = 'chorus_sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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

function insertSession(
  userId: string | null,
  guestId: string,
): { token: string; session: RequestSession } {
  const token = generateToken();
  const id = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  db.insert(sessions).values({ id, userId, guestId, expiresAt: expiresAt.toISOString() }).run();

  return { token, session: { id, userId, guestId, expiresAt } };
}

/**
 * Ensures every request has a valid session, transparently issuing an
 * anonymous guest session when no valid cookie is present. This keeps guest
 * play frictionless while giving CSRF protection a stable session identifier
 * to bind against on every request.
 */
export function sessionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;

  if (token) {
    const hashed = hashToken(token);
    const row = db.select().from(sessions).where(eq(sessions.id, hashed)).get();

    if (row && new Date(row.expiresAt) > new Date()) {
      req.session = {
        id: row.id,
        userId: row.userId,
        guestId: row.guestId,
        expiresAt: new Date(row.expiresAt),
      };
      next();
      return;
    }

    // Stale/expired/unknown token — clean up if the row exists, then fall through to issuing a new one.
    if (row) {
      db.delete(sessions).where(eq(sessions.id, hashed)).run();
    }
  }

  req.session = issueGuestSession(res);
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
export function issueGuestSession(res: Response): RequestSession {
  const { token, session } = insertSession(null, randomUUID());
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
export function bindUserToSession(req: Request, res: Response, userId: string): RequestSession {
  db.delete(sessions).where(eq(sessions.id, req.session.id)).run();
  const { token, session } = insertSession(userId, req.session.guestId);
  setSessionCookie(res, token, session.expiresAt);
  req.session = session;
  return session;
}

/** Ends the current session and immediately issues a fresh guest session so the response
 * leaves the client with a valid session/CSRF pairing rather than a dangling stale one. */
export function destroySession(req: Request, res: Response): RequestSession {
  db.delete(sessions).where(eq(sessions.id, req.session.id)).run();
  clearSessionCookie(res);
  req.session = issueGuestSession(res);
  return req.session;
}
