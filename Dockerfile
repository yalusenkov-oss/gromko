# ── Stage 1: Build frontend (vite singlefile) ──
FROM node:20-slim AS frontend-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY index.html tsconfig.json vite.config.ts ./
COPY src/ ./src/
RUN npx vite build

# ── Stage 2: Build server (TypeScript → JS) ──
FROM node:20-slim AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci
COPY server/ ./
RUN npx tsc

# ── Stage 3: Compile SpotiFLAC Go binary ──
FROM golang:1.24-bookworm AS spotiflac-build
WORKDIR /src
COPY SpotiFLAC-main/go.mod SpotiFLAC-main/go.sum ./
RUN go mod download
COPY SpotiFLAC-main/backend ./backend
COPY SpotiFLAC-main/cmd ./cmd
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /spotiflac-server ./cmd/server

# ── Stage 4: Production runtime ──
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install server production dependencies (includes embedded-postgres)
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev

# Copy root package.json (Timeweb reads "scripts.start" from it)
COPY package.json ./

# Copy compiled server + frontend
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=frontend-build /app/dist ./dist

# Copy pre-compiled SpotiFLAC binary (no Go runtime needed!)
COPY --from=spotiflac-build /spotiflac-server ./SpotiFLAC-main/bin/spotiflac-server
COPY --from=spotiflac-build /spotiflac-server ./SpotiFLAC-main/bin/spotiflac-server-linux-amd64

# Pre-create writable data dirs (Timeweb runs as non-root user 'app')
RUN mkdir -p /app/data/uploads /app/data/audio /app/data/covers /app/data/waveforms /app/data/temp /tmp/pgdata /app/SpotiFLAC-main/downloads \
    && chmod -R 777 /app /tmp/pgdata

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=3001
ENV PGDATA=/tmp/pgdata

EXPOSE 3001

# Timeweb ignores CMD — it runs `npm start` from package.json
CMD ["node", "server/dist/index.js"]
