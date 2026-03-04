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

COPY --from=server-build /app/server/dist ./server/dist
COPY --from=frontend-build /app/dist ./dist
COPY start.sh ./start.sh
RUN chmod +x start.sh

RUN mkdir -p /tmp/gromko-data/uploads /tmp/gromko-data/audio /tmp/gromko-data/covers /tmp/gromko-data/waveforms /tmp/gromko-data/temp && chmod -R 777 /tmp/gromko-data
RUN mkdir -p /run/postgresql && chown postgres:postgres /run/postgresql

ENV NODE_ENV=production
ENV DATA_DIR=/tmp/gromko-data
ENV PORT=3001

EXPOSE 3001

CMD ["./start.sh"]
