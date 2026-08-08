import { createServer } from 'node:http';
import { createApp } from './app';
import { attachWebSocketServer } from './ws';
import { env } from './env';
import { logger } from './logger';
import { seedIfEmpty } from './db/seed';
import { ensureDailyPlaylistsFresh } from './services/dailyPlaylistService';
import { startArtistPoolEviction } from './services/artistCatalogService';

const app = createApp();
const server = createServer(app);

attachWebSocketServer(server);

server.listen(env.PORT, () => {
  logger.info(`Chorus server listening on port ${env.PORT} (${env.NODE_ENV})`);
});

// Seed the fallback pool first (only inserts when the songs table is empty), then
// sync from the Deezer playlists so the daily puzzle bank is fresh at startup.
seedIfEmpty()
  .then(() => ensureDailyPlaylistsFresh(true))
  .catch((err) => {
    logger.error({ err }, 'Startup song seeding/sync failed');
  });

// Sweep artist catalogs nobody has played in 30 days, now and once a day after.
startArtistPoolEviction();
