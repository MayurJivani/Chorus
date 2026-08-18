import { apiRequest } from './client';
import type { AdminDailyPuzzleList, AdminOverview, AdminSong } from '../types/api';

export function getAdminOverview(): Promise<AdminOverview> {
  return apiRequest<AdminOverview>('/admin/overview');
}

export function getDailyPuzzles(from?: string): Promise<AdminDailyPuzzleList> {
  return apiRequest<AdminDailyPuzzleList>(
    `/admin/daily-puzzles${from ? `?from=${encodeURIComponent(from)}` : ''}`,
  );
}

export async function searchAdminSongs(q: string): Promise<AdminSong[]> {
  const res = await apiRequest<{ songs: AdminSong[] }>(
    `/admin/songs${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
  );
  return res.songs;
}

export function setDailyPuzzle(date: string, songId: number): Promise<{ ok: true }> {
  return apiRequest(`/admin/daily-puzzles/${date}`, { method: 'PUT', body: { songId } });
}

export function unscheduleDailyPuzzle(date: string): Promise<{ ok: true }> {
  return apiRequest(`/admin/daily-puzzles/${date}`, { method: 'DELETE' });
}

export function updateSongFlags(
  songId: number,
  patch: { active?: boolean; manualOverride?: boolean },
): Promise<{ song: AdminSong }> {
  return apiRequest(`/admin/songs/${songId}`, { method: 'PATCH', body: patch });
}
