import { apiRequest } from './client';
import type {
  MultiplayerCreateRoomResponse,
  MultiplayerGameMode,
  MultiplayerGuessMode,
} from '../types/api';

export function createMultiplayerRoom(
  source: { artistId: number } | { categoryId: string },
  guessMode: MultiplayerGuessMode = 'search',
  gameMode: MultiplayerGameMode = 'classic',
): Promise<MultiplayerCreateRoomResponse> {
  return apiRequest<MultiplayerCreateRoomResponse>('/multiplayer/rooms', {
    method: 'POST',
    body: { ...source, guessMode, gameMode },
  });
}

/** Builds the WebSocket endpoint from the API base URL (http://… -> ws://…). */
export function multiplayerSocketUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8888/api';
  const base = apiUrl.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
  return `${base}/ws`;
}
