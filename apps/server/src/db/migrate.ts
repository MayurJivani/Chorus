import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve } from 'node:path';
import { db, sqlite } from './client';
import { logger } from '../logger';

migrate(db, { migrationsFolder: resolve(__dirname, 'migrations') });
logger.info('Database migrations applied');
sqlite.close();
