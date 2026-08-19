import { apiRequest } from './client';
import type {
  AdminDailyPuzzleList,
  AdminDashboard,
  AdminSong,
  SettingDescriptor,
  UpcomingSchedule,
} from '../types/api';

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

export async function getAdminSettings(): Promise<SettingDescriptor[]> {
  const res = await apiRequest<{ settings: SettingDescriptor[] }>('/admin/settings');
  return res.settings;
}

/** Saves a batch. The server validates all of them before writing any, so a rejected value
 *  leaves every other edit unapplied too — the whole form succeeds or fails together. */
export async function saveAdminSettings(
  updates: { key: string; value: unknown }[],
): Promise<SettingDescriptor[]> {
  const res = await apiRequest<{ settings: SettingDescriptor[] }>('/admin/settings', {
    method: 'PATCH',
    body: { updates },
  });
  return res.settings;
}

export async function resetAdminSetting(key: string): Promise<SettingDescriptor[]> {
  const res = await apiRequest<{ settings: SettingDescriptor[] }>(`/admin/settings/${key}/reset`, {
    method: 'POST',
  });
  return res.settings;
}

export function getAdminDashboard(): Promise<AdminDashboard> {
  return apiRequest<AdminDashboard>('/admin/dashboard');
}

export function getUpcomingSchedule(days = 14): Promise<UpcomingSchedule> {
  return apiRequest<UpcomingSchedule>(`/admin/daily-puzzles/upcoming?days=${days}`);
}

/** Swaps a date onto a different random song. Never returns the one it already had. */
export function randomizeDailyPuzzle(date: string): Promise<{ ok: true }> {
  return apiRequest(`/admin/daily-puzzles/${date}/randomize`, { method: 'POST' });
}
