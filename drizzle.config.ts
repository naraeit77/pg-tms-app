import { defineConfig } from 'drizzle-kit';

const isSupabase = process.env.DATABASE_URL?.includes('supabase.co') || process.env.DATABASE_URL?.includes('supabase.com');

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ...(isSupabase && { ssl: 'require' }),
  },
});
