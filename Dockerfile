# Backend CentralHub — imagen de producción para Railway
# Multi-stage: build TS + prisma generate → runtime mínimo

# node:20-slim (Debian): Prisma necesita libssl/openssl que Alpine (musl) no
# trae en la variante que sus engines esperan
FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force
COPY --from=build /app/dist ./dist

# Storage privado de documentos (INE, contratos firmados). En Railway se monta
# un VOLUMEN persistente en /data para que los archivos sobrevivan redeploys:
#   FILE_STORAGE_DIR=/data/storage
RUN mkdir -p /data/storage && chown -R node:node /data /app
USER node

EXPOSE 4000

# Aplica las migraciones de Prisma antes de arrancar (idempotente)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
