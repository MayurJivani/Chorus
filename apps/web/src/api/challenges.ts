import { apiRequest } from './client';
import type { ChallengeSummary } from '../types/api';

export function getChallengeSummary(challengeId: number): Promise<ChallengeSummary> {
  return apiRequest<ChallengeSummary>(`/challenges/${challengeId}/summary`);
}
