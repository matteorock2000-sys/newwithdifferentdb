import fs from 'fs';
import { spawnSync } from 'child_process';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

const backupFile = process.argv[2] || 'db_cluster-05-12-2025@00-07-59.backup';
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.shkurfcrvucvsnxnmuof:Diocane123%2F@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

if (!fs.existsSync(backupFile)) {
  console.error(`Backup file not found: ${backupFile}`);
  process.exit(1);
}

const url = new URL(connectionString);
const password = decodeURIComponent(url.password);

console.log(`Restoring ${backupFile} with psql using the supplied PostgreSQL connection string...`);
console.log('This backup is a pg_dumpall cluster dump, so it should be applied as a SQL script.');

const result = spawnSync(
  'psql',
  ['-X', '-v', 'ON_ERROR_STOP=0', '-d', connectionString, '-f', backupFile],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      PGPASSWORD: password,
    },
  }
);

if (result.error) {
  console.error('Restore failed:', result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`Restore finished with exit code ${result.status}.`);
  process.exit(result.status ?? 1);
}

console.log('Restore completed.');
