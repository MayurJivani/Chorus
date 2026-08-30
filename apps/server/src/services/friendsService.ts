import { and, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { friendships, messages, users } from '../db/schema';

export class FriendsError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

export interface FriendView {
  friendshipId: number;
  userId: string;
  displayName: string;
  rating: number;
  status: string;
  since: string | null;
  unreadCount: number;
}

/**
 * Finds people by display name, for adding a friend by username rather than email.
 *
 * Display names are not unique — there is no username column and nothing stops two people
 * choosing the same one — so this returns matches for the requester to pick from rather than
 * pretending a name identifies an account. Asking for someone's email just to add them is the
 * thing this replaces; asking them to recognise their friend in a short list is not.
 *
 * Never returns email addresses. A name search that hands back contact details for strangers is
 * a directory, and this only needs to be enough to tell two people apart.
 */
export async function searchUsersByName(query: string, requesterId: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      rating: users.rating,
      ratedDuels: users.ratedDuels,
    })
    .from(users)
    .where(and(ilike(users.displayName, `%${trimmed}%`), ne(users.id, requesterId)))
    .orderBy(users.displayName)
    .limit(10);

  if (rows.length === 0) return [];

  // Annotate with the existing relationship so the UI can show "already friends" or "pending"
  // instead of offering a button that will only fail.
  const links = await db
    .select({
      requesterId: friendships.requesterId,
      addresseeId: friendships.addresseeId,
      status: friendships.status,
    })
    .from(friendships)
    .where(or(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, requesterId)));

  const statusFor = new Map<string, string>();
  for (const link of links) {
    const other = link.requesterId === requesterId ? link.addresseeId : link.requesterId;
    statusFor.set(other, link.status);
  }

  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    rating: row.rating,
    ratedDuels: row.ratedDuels,
    relationship: statusFor.get(row.id) ?? 'none',
  }));
}

/**
 * Sends a request to a specific account.
 *
 * Split out from the email version because a name search resolves to an id — re-deriving the
 * user from a display name here would reintroduce the ambiguity the search exists to resolve.
 */
export async function sendFriendRequestToUser(requesterId: string, addresseeId: string) {
  const rows = await db.select().from(users).where(eq(users.id, addresseeId)).limit(1);
  const addressee = rows[0];
  if (!addressee) throw new FriendsError('No such user', 404);
  return linkOrCreateRequest(requesterId, addressee);
}

export async function sendFriendRequest(requesterId: string, addresseeEmail: string) {
  const addresseeRows = await db
    .select()
    .from(users)
    .where(eq(users.email, addresseeEmail.trim().toLowerCase()))
    .limit(1);
  const addressee = addresseeRows[0];
  if (!addressee) throw new FriendsError('No user found with that email', 404);
  return linkOrCreateRequest(requesterId, addressee);
}

/** The request/accept bookkeeping, shared by the email and username paths. */
async function linkOrCreateRequest(
  requesterId: string,
  addressee: { id: string; displayName: string },
) {
  if (addressee.id === requesterId) throw new FriendsError('Cannot friend yourself');

  const existing = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addressee.id)),
        and(eq(friendships.requesterId, addressee.id), eq(friendships.addresseeId, requesterId)),
      ),
    )
    .limit(1);

  if (existing[0]) {
    if (existing[0].status === 'accepted') throw new FriendsError('Already friends');
    if (existing[0].status === 'pending') throw new FriendsError('Request already pending');
    if (existing[0].status === 'rejected') {
      await db
        .update(friendships)
        .set({ status: 'pending', requesterId, addresseeId: addressee.id })
        .where(eq(friendships.id, existing[0].id));
      return { id: existing[0].id, addressee: addressee.displayName };
    }
  }

  const [row] = await db
    .insert(friendships)
    .values({ requesterId, addresseeId: addressee.id })
    .returning({ id: friendships.id });
  return { id: row!.id, addressee: addressee.displayName };
}

export async function respondToRequest(friendshipId: number, userId: string, accept: boolean) {
  const [row] = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.id, friendshipId), eq(friendships.addresseeId, userId)))
    .limit(1);

  if (!row) throw new FriendsError('Friend request not found', 404);
  if (row.status !== 'pending') throw new FriendsError('Request already handled');

  await db
    .update(friendships)
    .set({
      status: accept ? 'accepted' : 'rejected',
      acceptedAt: accept ? new Date() : null,
    })
    .where(eq(friendships.id, friendshipId));
}

export async function removeFriend(friendshipId: number, userId: string) {
  const [row] = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.id, friendshipId),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
      ),
    )
    .limit(1);

  if (!row) throw new FriendsError('Friendship not found', 404);
  await db.delete(friendships).where(eq(friendships.id, friendshipId));
}

export async function listFriends(userId: string): Promise<FriendView[]> {
  const rows = (await db.execute(sql`
    SELECT
      f.id AS "friendshipId",
      CASE WHEN f.requester_id = ${userId} THEN f.addressee_id ELSE f.requester_id END AS "userId",
      u.display_name AS "displayName",
      u.rating,
      f.status,
      f.accepted_at AS "since",
      COALESCE(unread.cnt, 0)::int AS "unreadCount"
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.requester_id = ${userId} THEN f.addressee_id ELSE f.requester_id END
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt FROM messages m
      WHERE m.sender_id = u.id AND m.recipient_id = ${userId} AND m.read_at IS NULL
    ) unread ON true
    WHERE (f.requester_id = ${userId} OR f.addressee_id = ${userId})
      AND f.status = 'accepted'
    ORDER BY u.display_name ASC
  `)) as unknown as FriendView[];

  return rows;
}

export async function listPendingRequests(userId: string) {
  const rows = (await db.execute(sql`
    SELECT
      f.id AS "friendshipId",
      f.requester_id AS "requesterId",
      u.display_name AS "displayName",
      f.created_at AS "createdAt"
    FROM friendships f
    JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = ${userId} AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `)) as unknown as {
    friendshipId: number;
    requesterId: string;
    displayName: string;
    createdAt: string;
  }[];

  return rows;
}

export async function areFriends(userA: string, userB: string): Promise<boolean> {
  const [row] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(
        or(
          and(eq(friendships.requesterId, userA), eq(friendships.addresseeId, userB)),
          and(eq(friendships.requesterId, userB), eq(friendships.addresseeId, userA)),
        ),
        eq(friendships.status, 'accepted'),
      ),
    )
    .limit(1);

  return !!row;
}

export interface MessageView {
  id: number;
  senderId: string;
  senderName: string;
  body: string;
  invite: { type: 'duel' | 'multiplayer'; id: number | string } | null;
  createdAt: string;
  read: boolean;
}

export async function getConversation(
  userId: string,
  friendId: string,
  limit = 50,
): Promise<MessageView[]> {
  if (!(await areFriends(userId, friendId))) {
    throw new FriendsError('Not friends', 403);
  }

  const rows = (await db.execute(sql`
    SELECT
      m.id,
      m.sender_id AS "senderId",
      u.display_name AS "senderName",
      m.body,
      m.invite,
      m.created_at AS "createdAt",
      m.read_at IS NOT NULL AS "read"
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE (m.sender_id = ${userId} AND m.recipient_id = ${friendId})
       OR (m.sender_id = ${friendId} AND m.recipient_id = ${userId})
    ORDER BY m.created_at DESC
    LIMIT ${limit}
  `)) as unknown as MessageView[];

  // Mark received messages as read
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.senderId, friendId),
        eq(messages.recipientId, userId),
        sql`${messages.readAt} IS NULL`,
      ),
    );

  return rows.reverse();
}

export async function sendMessage(
  senderId: string,
  recipientId: string,
  body: string,
  invite?: { type: 'duel' | 'multiplayer'; id: number | string },
) {
  if (!(await areFriends(senderId, recipientId))) {
    throw new FriendsError('Not friends', 403);
  }

  if (!body.trim() && !invite) throw new FriendsError('Message cannot be empty');
  if (body.length > 500) throw new FriendsError('Message too long');

  const [msg] = await db
    .insert(messages)
    .values({
      senderId,
      recipientId,
      body: body.trim(),
      invite: invite ?? null,
    })
    .returning();

  return msg!;
}
