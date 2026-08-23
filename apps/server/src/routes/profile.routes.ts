import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { hashPassword, verifyPassword } from '../auth/password';
import { requireAuth } from '../middleware/requireAuth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';

export const profileRouter = Router();

profileRouter.use(requireAuth);

const updateDisplayNameSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});

profileRouter.patch(
  '/display-name',
  validate(updateDisplayNameSchema),
  asyncHandler(async (req, res) => {
    const { displayName } = req.body as z.infer<typeof updateDisplayNameSchema>;
    await db.update(users).set({ displayName }).where(eq(users.id, req.session.userId!));
    res.json({ ok: true, displayName });
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

profileRouter.patch(
  '/password',
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
    const userId = req.session.userId!;

    const [user] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) throw new HttpError(404, 'User not found');

    const valid = await verifyPassword(user.passwordHash, currentPassword);
    if (!valid) throw new HttpError(401, 'Current password is incorrect');

    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
    res.json({ ok: true });
  }),
);

profileRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        rating: users.rating,
        ratedDuels: users.ratedDuels,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.session.userId!))
      .limit(1);

    if (!user) throw new HttpError(404, 'User not found');
    res.json(user);
  }),
);
