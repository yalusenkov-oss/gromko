#!/bin/bash
set -e

PGDATA="/app/pgdata"

# If DATABASE_URL is already set (external DB), skip local PostgreSQL
if [ -z "$DATABASE_URL" ]; then
  echo "  [start.sh] No DATABASE_URL set — starting embedded PostgreSQL..."

  # Initialize DB cluster if first run
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "  [start.sh] Initializing PostgreSQL data directory in $PGDATA..."
    initdb -D "$PGDATA" --auth=trust --encoding=UTF8 --locale=C
  fi

  echo "  [start.sh] Starting PostgreSQL..."
  pg_ctl -D "$PGDATA" -l /tmp/pg.log start -w -t 30

  # Create gromko database if it doesn't exist
  psql -v ON_ERROR_STOP=1 -tc "SELECT 1 FROM pg_database WHERE datname='gromko'" | grep -q 1 || psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE gromko"

  export DATABASE_URL="postgresql://postgres@localhost/gromko"
  echo "  [start.sh] PostgreSQL ready: $DATABASE_URL"
else
  echo "  [start.sh] Using external DATABASE_URL"
fi

echo "  [start.sh] Starting Node.js server..."
exec node server/dist/index.js
