import { config } from 'dotenv';

config({ path: '.env.local', override: true });
config({ path: '.env', override: false });

export const env = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_URL_FALLBACK: process.env.DATABASE_URL_FALLBACK,
  SESSION_SECRET: process.env.SESSION_SECRET,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
};
