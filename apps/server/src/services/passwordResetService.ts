import { randomBytes, createHash } from 'node:crypto';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { db } from '../db/client';
import { passwordResetTokens, users } from '../db/schema';
import { hashPassword } from '../auth/password';

export class ResetError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generates a reset token for the given email. Returns the raw token (to be sent via email or
 * displayed in dev mode). Returns null if the email doesn't exist — the caller should still
 * respond 200 to prevent enumeration.
 */
export async function createResetToken(email: string): Promise<string | null> {
  const normalised = email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, normalised)).limit(1);
  if (!user) return null;

  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });

  return token;
}

/**
 * Resets the password given a valid token. Single-use: the token is consumed on success.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw new ResetError('Password must be at least 8 characters');
  if (newPassword.length > 128) throw new ResetError('Password too long');

  const tokenHash = hashToken(token);
  const now = new Date();

  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!row) throw new ResetError('Invalid or expired reset link', 401);

  const passwordHash = await hashPassword(newPassword);

  await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: now })
    .where(eq(passwordResetTokens.id, row.id));
}
