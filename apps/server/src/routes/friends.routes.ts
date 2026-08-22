import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import { validate } from '../middleware/validate';
import {
  FriendsError,
  getConversation,
  listFriends,
  listPendingRequests,
  removeFriend,
  respondToRequest,
  sendFriendRequest,
  sendMessage,
} from '../services/friendsService';

export const friendsRouter = Router();

function requireUser(req: { session: { userId: string | null } }): string {
  if (!req.session.userId) throw new FriendsError('Login required', 401);
  return req.session.userId;
}

friendsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = requireUser(req);
    res.json(await listFriends(userId));
  }),
);

friendsRouter.get(
  '/pending',
  asyncHandler(async (req, res) => {
    const userId = requireUser(req);
    res.json(await listPendingRequests(userId));
  }),
);

const requestSchema = z.object({ email: z.string().trim().toLowerCase().email() });

friendsRouter.post(
  '/request',
  validate(requestSchema),
  asyncHandler(async (req, res) => {
    const userId = requireUser(req);
    const { email } = req.body as z.infer<typeof requestSchema>;
    const result = await sendFriendRequest(userId, email);
    res.status(201).json(result);
  }),
);

const respondSchema = z.object({ accept: z.boolean() });

friendsRouter.post(
  '/:id/respond',
  validate(respondSchema),
  asyncHandler(async (req, res) => {
    const userId = requireUser(req);
    const friendshipId = Number(req.params.id);
    const { accept } = req.body as z.infer<typeof respondSchema>;
    await respondToRequest(friendshipId, userId, accept);
    res.json({ ok: true });
  }),
);

friendsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = requireUser(req);
    await removeFriend(Number(req.params.id), userId);
    res.json({ ok: true });
  }),
);

// --- Chat ---

friendsRouter.get(
  '/:friendId/messages',
  asyncHandler(async (req, res) => {
    const userId = requireUser(req);
    res.json(await getConversation(userId, req.params.friendId as string));
  }),
);

const messageSchema = z.object({
  body: z.string().max(500).default(''),
  invite: z
    .object({
      type: z.enum(['duel', 'multiplayer']),
      id: z.union([z.number(), z.string()]),
    })
    .optional(),
});

friendsRouter.post(
  '/:friendId/messages',
  validate(messageSchema),
  asyncHandler(async (req, res) => {
    const userId = requireUser(req);
    const { body, invite } = req.body as z.infer<typeof messageSchema>;
    const msg = await sendMessage(userId, req.params.friendId as string, body, invite);
    res.status(201).json(msg);
  }),
);
