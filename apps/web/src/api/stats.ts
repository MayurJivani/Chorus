import { apiRequest } from './client';
import type { ProgressSummary, StatsResponse } from '../types/api';

export function getMyStats(): Promise<StatsResponse> {
  return apiRequest<StatsResponse>('/stats/me');
}

/** Level, XP and mastery. Derived server-side from runs already recorded. */
export function getMyProgress(): Promise<ProgressSummary> {
  return apiRequest<ProgressSummary>('/stats/progress');
}
