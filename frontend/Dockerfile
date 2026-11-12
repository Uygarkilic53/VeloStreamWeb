# ── Stage 1: Build ────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

# Install workspace root + frontend dependencies
COPY package.json package-lock.json* ./
COPY frontend/package.json ./frontend/

RUN npm ci --workspace=@velostream/frontend --include-workspace-root

# Copy source & build
COPY tsconfig.base.json ./
COPY frontend ./frontend

RUN npm run build -w @velostream/frontend

# ── Stage 2: Serve with nginx ────────────────────────────────────
FROM nginx:1.27-alpine

# Remove default site
RUN rm /etc/nginx/conf.d/default.conf

# Custom nginx config: SPA routing, gzip, security headers
COPY frontend/nginx.conf /etc/nginx/conf.d/velostream.conf

# Copy Vite build output
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
