#!/bin/bash
# Start the SpotiFLAC API server for GROMKO integration
# Usage: ./start-spotiflac.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/SpotiFLAC-main"

export SPOTIFLAC_PORT="${SPOTIFLAC_PORT:-3099}"
export SPOTIFLAC_DOWNLOAD_DIR="${SPOTIFLAC_DOWNLOAD_DIR:-$SCRIPT_DIR/data/temp/spotiflac}"

echo "🎵 Starting SpotiFLAC API server..."
echo "   Port: $SPOTIFLAC_PORT"
echo "   Downloads: $SPOTIFLAC_DOWNLOAD_DIR"

mkdir -p "$SPOTIFLAC_DOWNLOAD_DIR"

go run ./cmd/server
