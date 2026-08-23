import { apiRequest } from './client';

export interface ProfileData {
  id: string;
  email: string;
  displayName: string;
  rating: number;
  ratedDuels: number;
  createdAt: string;
}

export function getProfile(): Promise<ProfileData> {
  return apiRequest<ProfileData>('/profile');
}

export function updateDisplayName(displayName: string): Promise<{ ok: true; displayName: string }> {
  return apiRequest('/profile/display-name', { method: 'PATCH', body: { displayName } });
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true }> {
  return apiRequest('/profile/password', {
    method: 'PATCH',
    body: { currentPassword, newPassword },
  });
}
