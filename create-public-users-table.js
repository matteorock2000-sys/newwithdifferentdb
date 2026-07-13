import sql from './db.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL must be set in your environment');
}

console.log('Using DATABASE_URL:', connectionString.replace(/(postgresql:\/\/postgres:)[^@]+(@)/, '$1***$2'));

const createUsersTableSql = `
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL UNIQUE,
  username varchar(255) NOT NULL UNIQUE,
  hashed_password varchar(255) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users (username);

CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION update_users_updated_at();
`;

async function run() {
  try {
    console.log('Creating public.users table...');
    await sql.begin(async sqlClient => {
      await sqlClient.unsafe(createUsersTableSql);
    });
    console.log('✅ public.users table created or already exists.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to create public.users table:', error);
    process.exit(1);
  }
}

run();
