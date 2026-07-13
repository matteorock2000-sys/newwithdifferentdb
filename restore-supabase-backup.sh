#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-db_cluster-05-12-2025@00-07-59.backup}"
DB_URL="${DB_URL:-postgresql://postgres.dh78qv3kuywewouckhca:diocane123@db.dh78qv3kuywewouckhca.supabase.com:5432/postgres}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if ! head -n 5 "$BACKUP_FILE" | grep -q "PostgreSQL database cluster dump"; then
  echo "This does not look like a PostgreSQL cluster dump backup: $BACKUP_FILE" >&2
  exit 1
fi

export PGPASSWORD="${PGPASSWORD:-diocane123}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"

echo "Restoring $BACKUP_FILE to $DB_URL"

if ! psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$BACKUP_FILE"; then
  echo "Restore failed. The database host could not be reached from this environment." >&2
  echo "Verify outbound access to db.dh78qv3kuywewouckhca.supabase.com:5432 and that PostgreSQL traffic is allowed." >&2
  exit 1
fi
