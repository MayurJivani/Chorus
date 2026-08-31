/**
 * Prints any admin-stored setting overrides.
 *
 * Defaults live in code, but a row in `app_settings` wins — so changing a default is only
 * effective for keys nobody has overridden. Worth checking before assuming a new default is
 * what the game is actually running on.
 *
 *   npx tsx apps/server/src/scripts/show-settings.ts
 */
import { db } from '../db/client';
import { appSettings } from '../db/schema';

async function main() {
  const rows = await db.select().from(appSettings);
  if (rows.length === 0) {
    console.log('No stored overrides — every setting is using its code default.');
  } else {
    for (const row of rows) {
      console.log(`${row.key} = ${JSON.stringify(row.value)}`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
