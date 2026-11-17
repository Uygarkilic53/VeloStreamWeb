# ── Stage 1: Build ────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

# Install openssl for Prisma binary engine generation on Alpine musl
RUN apk add --no-cache openssl ca-certificates

# Install root & workspace dependencies
COPY package.json package-lock.json* ./
COPY backend/fastify/package.json ./backend/fastify/

RUN npm ci --workspace=@velostream/fastify --include-workspace-root

# Copy base configuration and Fastify source code
COPY tsconfig.base.json ./
COPY backend/fastify ./backend/fastify

# Generate Prisma client and compile TypeScript
RUN npx --workspace=@velostream/fastify prisma generate \
 && npm run build -w @velostream/fastify

# ── Stage 2: Runtime ──────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

# openssl is required by Prisma query engine on Alpine; wget for healthchecks
RUN apk add --no-cache openssl ca-certificates wget

ENV NODE_ENV=production

# Copy root workspace manifests
COPY package.json package-lock.json* ./
COPY backend/fastify/package.json ./backend/fastify/

# Copy built node_modules, Prisma schema/migrations, and compiled output from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/fastify/prisma ./backend/fastify/prisma
COPY --from=builder /app/backend/fastify/dist ./backend/fastify/dist

EXPOSE 3001

# Deploy pending migrations if database is available, then start Fastify server
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then npx --workspace=@velostream/fastify prisma migrate deploy || true; fi; exec node backend/fastify/dist/server.js"]
