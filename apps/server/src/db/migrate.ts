import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
import { db, sqlClient } from './client';
import { logger } from '../logger';

async function run(): Promise<void> {
  await migrate(db, { migrationsFolder: resolve(__dirname, 'migrations') });
  logger.info('Database migrations applied');
}

/**
 * The connection pool must be closed explicitly, and the container's start command is
 * `node dist/db/migrate.js && node dist/index.js`. postgres-js holds its sockets open with no
 * idle timeout, so an open pool keeps the event loop alive and this process never exits —
 * which means the `&&` never fires and the server never starts. Closing the pool (and exiting
 * on an explicit code) is what lets the boot sequence continue.
 */
run()
  .then(async () => {
    await sqlClient.end();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error({ err }, 'Database migration failed');
    await sqlClient.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  });
