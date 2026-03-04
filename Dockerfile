FROM node:20-slim AS frontend-build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:20-slim AS server-build

WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci
COPY server/ ./
RUN npx tsc

FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    postgresql \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev
# tsx needed for s3-import script
RUN cd server && npm install tsx

COPY --from=server-build /app/server/dist ./server/dist
COPY server/src ./server/src
COPY server/tsconfig.json ./server/tsconfig.json
COPY --from=frontend-build /app/dist ./dist
COPY start.sh ./start.sh
RUN chmod +x start.sh

# Persistent data — mount a volume to /app/data in production
RUN mkdir -p /app/data/uploads /app/data/audio /app/data/covers /app/data/waveforms /app/data/temp && chmod -R 777 /app/data
RUN mkdir -p /app/pgdata && chmod -R 777 /app/pgdata
RUN mkdir -p /var/run/postgresql && chmod 777 /var/run/postgresql

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=3001

# Mount these as Docker volumes to persist data across container restarts:
#   docker run -v gromko-pgdata:/app/pgdata -v gromko-data:/app/data ...
VOLUME ["/app/pgdata", "/app/data"]

EXPOSE 3001

CMD ["./start.sh"]
