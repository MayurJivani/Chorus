import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { hashPassword, verifyPassword } from '../auth/password';
import { bindUserToSession, destroySession } from '../auth/session';
import { mergeGuestStatsIntoUser } from '../services/statsService';
import { validate } from '../middleware/validate';
import { authRateLimiter } from '../middleware/rateLimiters';
import { generateCsrfToken } from '../middleware/csrf';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(40),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

function toPublicUser(user: { id: string; email: string; displayName: string }) {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

authRouter.post('/register', authRateLimiter, validate(registerSchema), async (req, res) => {
  const { email, password, displayName } = req.body as z.infer<typeof registerSchema>;

  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    res.status(409).json({ error: 'An account with that email already exists' });
    return;
  }

  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  const guestId = req.session.guestId;

  db.insert(users).values({ id, email, passwordHash, displayName }).run();
  mergeGuestStatsIntoUser(guestId, id);
  bindUserToSession(req, res, id);
  // Rotating the session invalidates the CSRF token the client is holding — issue a fresh one
  // bound to the new session so the very next state-changing request doesn't get rejected.
  const csrfToken = generateCsrfToken(req, res, { overwrite: true });

  res.status(201).json({ user: toPublicUser({ id, email, displayName }), csrfToken });
});

authRouter.post('/login', authRateLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const user = db.select().from(users).where(eq(users.email, email)).get();
  const genericError = { error: 'Invalid email or password' };

  if (!user) {
    // Still hash something to keep response timing similar whether or not the account exists.
    await hashPassword(password);
    res.status(401).json(genericError);
    return;
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    res.status(401).json(genericError);
    return;
  }

  db.update(users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(users.id, user.id))
    .run();
  bindUserToSession(req, res, user.id);
  const csrfToken = generateCsrfToken(req, res, { overwrite: true });

  res.json({ user: toPublicUser(user), csrfToken });
});

authRouter.post('/logout', (req, res) => {
  destroySession(req, res);
  const csrfToken = generateCsrfToken(req, res, { overwrite: true });
  res.json({ ok: true, csrfToken });
});

authRouter.get('/me', (req, res) => {
  if (!req.session.userId) {
    res.json({ user: null, guestId: req.session.guestId });
    return;
  }

  const user = db.select().from(users).where(eq(users.id, req.session.userId)).get();
  if (!user) {
    res.json({ user: null, guestId: req.session.guestId });
    return;
  }

  res.json({ user: toPublicUser(user) });
});
