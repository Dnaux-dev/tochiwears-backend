import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Check your .env file.');
}

const isLocal = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon requires TLS; a local dev Postgres usually doesn't offer it.
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool);

/** A transaction handle, as passed to the db.transaction() callback. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Anything queries can run on: the pool-backed db or an open transaction. */
export type DbExecutor = typeof db | Tx;
