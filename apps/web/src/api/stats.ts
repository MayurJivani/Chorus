import { apiRequest } from './client';
import type { StatsResponse } from '../types/api';

export function getMyStats(): Promise<StatsResponse> {
  return apiRequest<StatsResponse>('/stats/me');
}
