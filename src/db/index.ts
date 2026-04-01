import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const isSupabase = process.env.DATABASE_URL?.includes('supabase.co') || process.env.DATABASE_URL?.includes('supabase.com');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ...(isSupabase && {
    ssl: { rejectUnauthorized: false },
  }),
});

export const db = drizzle(pool, { schema });
export { pool };
