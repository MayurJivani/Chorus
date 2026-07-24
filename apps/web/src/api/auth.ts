import { apiRequest } from './client';
import type { AuthResponse, MeResponse } from '../types/api';

export function getMe(): Promise<MeResponse> {
  return apiRequest<MeResponse>('/auth/me');
}

export function register(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/register', { method: 'POST', body: input });
}

export function login(input: { email: string; password: string }): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: input });
}

export function logout(): Promise<{ ok: boolean; csrfToken: string }> {
  return apiRequest('/auth/logout', { method: 'POST' });
}
