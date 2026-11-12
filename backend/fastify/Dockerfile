FROM node:24-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY backend/fastify/package.json ./backend/fastify/

RUN npm ci --workspace=@velostream/fastify --include-workspace-root

COPY tsconfig.base.json ./
COPY backend/fastify ./backend/fastify

RUN npx --workspace=@velostream/fastify prisma generate \
 && npm run build -w @velostream/fastify

EXPOSE 3001
CMD ["node", "backend/fastify/dist/server.js"]

