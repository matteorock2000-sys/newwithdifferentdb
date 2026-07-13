import sql from './db.js';

const addColumnsSql = `
-- Add missing columns to characters table
ALTER TABLE public.characters 
ADD COLUMN IF NOT EXISTS features TEXT[],
ADD COLUMN IF NOT EXISTS personality JSONB,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
`;

async function run() {
  try {
    console.log('Adding missing columns to characters table...');
    await sql.begin(async sqlClient => {
      await sqlClient.unsafe(addColumnsSql);
    });
    console.log('✅ Missing columns added to characters table.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to add columns:', error);
    process.exit(1);
  }
}

run();