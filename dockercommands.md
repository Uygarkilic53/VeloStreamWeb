# VeloStream — Docker Commands Cheat Sheet

## Everyday Commands

| Command | What it does |
|---------|-------------|
| `npm run up` | Build all images + start the full stack (postgres, mediamtx, fastify, fiber, frontend). Rebuilds only layers that changed. |
| `npm run down` | Stop and remove all containers. Keeps data volumes (DB data preserved). |
| `npm run restart` | `down` + `up` in one shot — rebuild and clean restart. |
| `npm run logs` | Tail all container logs live (`Ctrl+C` to exit). |
| `npm run ps` | Show status of all running containers. |

## When You Need More Control

| Command | What it does |
|---------|-------------|
| `npm run up:fresh` | Rebuild all images + force-recreate every container, even if nothing changed. |
| `npm run down:clean` | Stop everything **and delete volumes** (wipes Postgres data). Full reset. |
| `npm run infra:up` | Start **only** infrastructure (postgres, mediamtx) — for local dev where you run fastify, fiber, and frontend on your host. |

## Raw Docker Compose (same thing, more options)

```powershell
# Build + start everything
docker compose up -d --build

# Rebuild only one service
docker compose up -d --build fastify

# View logs for specific services
docker compose logs -f fastify fiber

# Restart a single service
docker compose restart frontend

# Stop one service without touching the rest
docker compose stop fiber

# Exec into a running container
docker compose exec fastify sh
docker compose exec postgres psql -U velostream

# Check container health
docker compose ps
docker inspect --format='{{.State.Health.Status}}' velostream-fastify
```

## First-Time Setup

```powershell
# 1. Generate JWT keys (only once)
npm run keys:generate

# 2. Build and start everything
npm run up

# 3. Verify containers are healthy
npm run ps
```

## Ports

| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| Fastify API | http://localhost:3001 |
| Fiber Service | http://localhost:3002 |
| MediaMTX (RTMP) | rtmp://localhost:1935 |
| MediaMTX (HLS) | http://localhost:8888 |
| MediaMTX (WebRTC/WHIP) | http://localhost:8889 |
| PostgreSQL | localhost:5432 |

