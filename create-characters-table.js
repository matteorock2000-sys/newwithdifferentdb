import { config } from 'dotenv';
import postgres from 'postgres';
import fs from 'fs';

config({ path: '.env.local', override: true });
config({ path: '.env', override: false });

const connectionString = process.env.DATABASE_URL;
const fallbackConnectionString = process.env.DATABASE_URL_FALLBACK;

if (!connectionString) {
  throw new Error('DATABASE_URL must be set in your environment');
}

const originalHost = new URL(connectionString).hostname;

async function hostSupportsIPv4(connectionUrl) {
  const host = new URL(connectionUrl).hostname;
  try {
    const { promises: dns } = await import('dns');
    const addresses = await dns.resolve4(host);
    return addresses && addresses.length > 0;
  } catch (error) {
    return false;
  }
}

async function resolveConnectionString() {
  if (await hostSupportsIPv4(connectionString)) {
    return { connectionString, sslServername: originalHost, allowSelfSigned: false };
  }

  if (fallbackConnectionString) {
    console.warn(
      `WARNING: DATABASE_URL does not resolve to IPv4. Using DATABASE_URL_FALLBACK with SNI host ${originalHost}.`
    );
    return {
      connectionString: fallbackConnectionString,
      sslServername: originalHost,
      allowSelfSigned: true,
    };
  }

  return { connectionString, sslServername: originalHost, allowSelfSigned: false };
}

const { connectionString: resolvedConnectionString, sslServername, allowSelfSigned } = await resolveConnectionString();

const sql = postgres(resolvedConnectionString, {
  ssl: {
    rejectUnauthorized: !allowSelfSigned,
    servername: sslServername,
  },
  max: 1,
});

async function run() {
  try {
    console.log('Creating characters table...');
    const sqlContent = fs.readFileSync('create_characters_table.sql', 'utf-8');
    await sql.unsafe(sqlContent);
    console.log('✅ characters table created or already exists.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to create characters table:', error);
    process.exit(1);
  }
}

run();