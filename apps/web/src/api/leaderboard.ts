import { apiRequest } from './client';
import type { LeaderboardResponse } from '../types/api';

export function getLeaderboard(): Promise<LeaderboardResponse> {
  return apiRequest<LeaderboardResponse>('/leaderboard');
}
