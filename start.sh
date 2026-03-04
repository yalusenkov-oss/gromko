#!/bin/bash
set -e

# If DATABASE_URL is already set (external DB), skip local PostgreSQL
if [ -z "$DATABASE_URL" ]; then
  echo "  [start.sh] No DATABASE_URL set — starting embedded PostgreSQL..."

  PGDATA="/var/lib/postgresql/data"

  # Initialize DB cluster if first run
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "  [start.sh] Initializing PostgreSQL data directory..."
    su postgres -c "initdb -D $PGDATA --auth=trust --encoding=UTF8 --locale=C"
  fi

  # Start PostgreSQL
  su postgres -c "pg_ctl -D $PGDATA -l /tmp/pg.log start -w -t 30"

  # Create gromko database if it doesn't exist
  su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='gromko'\" | grep -q 1 || psql -c 'CREATE DATABASE gromko'"

  export DATABASE_URL="postgresql://postgres@localhost/gromko"
  echo "  [start.sh] PostgreSQL ready: $DATABASE_URL"
else
  echo "  [start.sh] Using external DATABASE_URL"
fi

echo "  [start.sh] Starting Node.js server..."
exec node server/dist/index.js
