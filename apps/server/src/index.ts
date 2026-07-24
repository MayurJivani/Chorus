import { createApp } from './app';
import { env } from './env';
import { logger } from './logger';

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Chorus server listening on port ${env.PORT} (${env.NODE_ENV})`);
});
