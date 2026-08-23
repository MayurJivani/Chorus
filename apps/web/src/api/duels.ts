import { apiRequest } from './client';
import type { DuelView, RatingLeaderboard } from '../types/api';

export function createDuel(
  source: { artistId: number } | { categoryId: string },
): Promise<DuelView> {
  return apiRequest<DuelView>('/duels', { method: 'POST', body: source });
}

export function getDuel(duelId: number): Promise<DuelView> {
  return apiRequest<DuelView>(`/duels/${duelId}`);
}

export function acceptDuel(duelId: number): Promise<DuelView> {
  return apiRequest<DuelView>(`/duels/${duelId}/accept`, { method: 'POST' });
}

export async function getMyDuels(): Promise<DuelView[]> {
  const res = await apiRequest<{ duels: DuelView[] }>('/duels/mine');
  return res.duels;
}

export async function getOpenDuels(): Promise<DuelView[]> {
  const res = await apiRequest<{ duels: DuelView[] }>('/duels/open');
  return res.duels;
}

export function getRatingLeaderboard(): Promise<RatingLeaderboard> {
  return apiRequest<RatingLeaderboard>('/duels/leaderboard');
}

export function matchmake(): Promise<DuelView> {
  return apiRequest<DuelView>('/duels/matchmake', { method: 'POST' });
}
