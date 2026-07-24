import { createApp } from './app';
import { env } from './env';
import { logger } from './logger';
import { seedIfEmpty } from './db/seed';

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Chorus server listening on port ${env.PORT} (${env.NODE_ENV})`);
});

seedIfEmpty().catch((err) => {
  logger.error({ err }, 'Song seeding failed');
});
