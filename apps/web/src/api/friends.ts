import { apiRequest } from './client';

export interface FriendView {
  friendshipId: number;
  userId: string;
  displayName: string;
  rating: number;
  status: string;
  since: string | null;
  unreadCount: number;
}

export interface PendingRequest {
  friendshipId: number;
  requesterId: string;
  displayName: string;
  createdAt: string;
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

export function getFriends() {
  return apiRequest<FriendView[]>('/friends');
}

/** A person found by display name, with the existing relationship so the UI can act on it. */
export interface UserSearchResult {
  id: string;
  displayName: string;
  rating: number;
  ratedDuels: number;
  relationship: 'none' | 'pending' | 'accepted' | 'rejected' | string;
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const res = await apiRequest<{ users: UserSearchResult[] }>(
    `/friends/search?q=${encodeURIComponent(query)}`,
  );
  return res.users;
}

export function sendFriendRequestToUser(userId: string) {
  return apiRequest<{ id: number; addressee: string }>('/friends/request', {
    method: 'POST',
    body: { userId },
  });
}

export function getPendingRequests() {
  return apiRequest<PendingRequest[]>('/friends/pending');
}

export function sendFriendRequest(email: string) {
  return apiRequest<{ id: number; addressee: string }>('/friends/request', {
    method: 'POST',
    body: { email },
  });
}

export function respondToRequest(friendshipId: number, accept: boolean) {
  return apiRequest<{ ok: true }>(`/friends/${friendshipId}/respond`, {
    method: 'POST',
    body: { accept },
  });
}

export function removeFriend(friendshipId: number) {
  return apiRequest<{ ok: true }>(`/friends/${friendshipId}`, { method: 'DELETE' });
}

export function getMessages(friendId: string) {
  return apiRequest<MessageView[]>(`/friends/${friendId}/messages`);
}

export function sendMessageToFriend(
  friendId: string,
  body: string,
  invite?: { type: 'duel' | 'multiplayer'; id: number | string },
) {
  return apiRequest<MessageView>(`/friends/${friendId}/messages`, {
    method: 'POST',
    body: { body, invite },
  });
}
