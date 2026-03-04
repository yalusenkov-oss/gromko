#!/bin/bash
set -e

PGDATA="/app/pgdata"

# Ensure data directories exist and are writable
mkdir -p /app/data/uploads /app/data/audio /app/data/covers /app/data/waveforms /app/data/temp 2>/dev/null || true

# If DATABASE_URL is already set (external DB), skip local PostgreSQL
if [ -z "$DATABASE_URL" ]; then
  echo "  [start.sh] No DATABASE_URL set — starting embedded PostgreSQL..."

  PGUSER="$(whoami)"

  # Initialize DB cluster if first run
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "  [start.sh] Initializing PostgreSQL data directory in $PGDATA..."
    mkdir -p "$PGDATA" 2>/dev/null || true
    chmod 700 "$PGDATA" 2>/dev/null || true
    initdb -D "$PGDATA" --auth=trust --encoding=UTF8 --locale=C --username="$PGUSER"
  fi

  # Ensure correct ownership
  chmod 700 "$PGDATA" 2>/dev/null || true

  echo "  [start.sh] Starting PostgreSQL..."
  pg_ctl -D "$PGDATA" -l /tmp/pg.log start -w -t 30 || { echo "  [start.sh] pg_ctl start failed, log:"; cat /tmp/pg.log; exit 1; }

  # Create gromko database if it doesn't exist
  psql -U "$PGUSER" -tc "SELECT 1 FROM pg_database WHERE datname='gromko'" | grep -q 1 || psql -U "$PGUSER" -c "CREATE DATABASE gromko"

  export DATABASE_URL="postgresql://${PGUSER}@localhost/gromko"
  echo "  [start.sh] PostgreSQL ready: $DATABASE_URL"
else
  echo "  [start.sh] Using external DATABASE_URL"
fi

# ─── Auto S3 Import (first run only) ───
# If S3 keys are set and the DB has zero tracks, run the import automatically.
if [ -n "$S3_ACCESS_KEY" ] && [ -n "$S3_SECRET_KEY" ]; then
  TRACK_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM tracks" 2>/dev/null || echo "0")
  TRACK_COUNT=$(echo "$TRACK_COUNT" | tr -d '[:space:]')

  if [ "$TRACK_COUNT" = "0" ] || [ -z "$TRACK_COUNT" ]; then
    echo "  [start.sh] 🎵 DB is empty — running S3 import..."
    cd /app/server
    SKIP_EXISTING=1 npx tsx src/s3-import.ts 2>&1 | tail -30 || echo "  [start.sh] ⚠️ S3 import finished with errors (server will still start)"
    cd /app
    echo "  [start.sh] ✅ S3 import complete"
  else
    echo "  [start.sh] DB has $TRACK_COUNT tracks — skipping S3 import"
  fi
else
  echo "  [start.sh] No S3_ACCESS_KEY/S3_SECRET_KEY — skipping auto-import"
fi

echo "  [start.sh] Starting Node.js server..."
exec node server/dist/index.js
