import { apiRequest } from './client';
import type { SongSearchResult } from '../types/api';

export async function searchSongs(query: string): Promise<SongSearchResult[]> {
  if (!query.trim()) return [];
  const res = await apiRequest<{ results: SongSearchResult[] }>(
    `/songs/search?q=${encodeURIComponent(query)}`,
  );
  return res.results;
}
