import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '../env';
import * as schema from './schema';

/** Raw postgres-js client — shared by the query pool and (with max: 1) the migrator. */
export const sqlClient = postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle(sqlClient, { schema });
