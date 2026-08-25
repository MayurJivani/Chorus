import { apiRequest } from './client';
import type { FandomDetail, FandomInfo, TopFandom } from '../types/api';

export function joinFandom(
  deezerArtistId: string,
  artistName: string,
  artistPictureUrl: string | null,
): Promise<{ membership: FandomInfo }> {
  return apiRequest('/fandoms/join', {
    method: 'POST',
    body: { deezerArtistId, artistName, artistPictureUrl },
  });
}

export function leaveFandom(deezerArtistId: string): Promise<{ ok: true }> {
  return apiRequest(`/fandoms/${deezerArtistId}`, { method: 'DELETE' });
}

export async function getMyFandoms(): Promise<FandomInfo[]> {
  const res = await apiRequest<{ fandoms: FandomInfo[] }>('/fandoms/mine');
  return res.fandoms;
}

export function getMembership(deezerArtistId: string): Promise<{ membership: FandomInfo | null }> {
  return apiRequest(`/fandoms/membership/${deezerArtistId}`);
}

export function getFandomDetail(deezerArtistId: string): Promise<FandomDetail> {
  return apiRequest(`/fandoms/detail/${deezerArtistId}`);
}

export async function getTopFandoms(): Promise<TopFandom[]> {
  const res = await apiRequest<{ fandoms: TopFandom[] }>('/fandoms/top');
  return res.fandoms;
}
