import { beforeAll } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from '../src/db/client';
import { env } from '../src/env';

/**
 * Last line of defence before the suite starts deleting rows: integration tests truncate
 * `songs`, `daily_puzzles`, `sessions` and friends, so a misconfigured `DATABASE_URL` pointed
 * at the real database would silently wipe the song bank. Requiring a `_test` database name
 * makes that mistake impossible rather than merely unlikely.
 */
function assertTestDatabase(): void {
  const name = new URL(env.DATABASE_URL).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${name}": the test suite deletes rows and ` +
        `requires a database whose name ends in "_test". Set DATABASE_URL_TEST to override.`,
    );
  }
}

beforeAll(async () => {
  assertTestDatabase();
  await migrate(db, { migrationsFolder: `${__dirname}/../src/db/migrations` });
});
