# VeloStream Agent Operating Manual (`AGENTS.md`)

You are working on **VeloStream**, a high-concurrency, polyglot live streaming platform (React + TypeScript frontend, Node.js/Fastify + TypeScript API, Go + Fiber real-time service, MediaMTX media router, and PostgreSQL).

---

## 1. Repository Layout, Service Boundaries & MVC Architecture

Both backend services follow a **thin-routes, lean-controllers, rich-models** MVC layout with `app` separated from `server`/`main` startup so HTTP routes stay testable in memory without binding a port (`buildApp()` in Fastify; `app.New()` in Fiber). Validate all route params, queries, bodies, and env vars strictly.

- **`backend/fastify/` (The Brain):** Node.js + Fastify + TypeScript + Prisma ORM.
  - **Sole owner of PostgreSQL schema and migrations** (`prisma/`).
  - Handles user accounts, asymmetric JWT signing (`EdDSA`/`RS256`), stream keys, channel profiles, and moderation commands (bans/unbans).
  - *Rule:* Controllers orchestrate business logic using injected models and `lib/` utilities. Controllers never import `@prisma/client` directly.
- **`backend/fiber/` (The Muscle):** Go + Fiber + `pgx/v5`.
  - Handles high-concurrency WebSocket chat rooms, MediaMTX webhooks, and chat persistence/queries via `pgxpool`.
  - Verify JWTs locally via JWKS/public key; never call Fastify synchronously on per-message or WebSocket-connect hot paths.
  - *Rules:* Never write SQL DDL migrations in Go (query/write only Prisma-managed tables). No raw SQL queries directly in controllers. Enforce strict one-way Go package imports: `main` -> `app` -> `routes` -> `controllers` + `middlewares` -> `services` + `models`.
- **`frontend/` (The Stage):** Vite + React + TypeScript + Tailwind CSS + Vitest + Playwright.
  - Handles webcam/mic capture (WebRTC WHIP), HLS playback (`hls.js`), REST requests to Fastify, and WebSocket chat to Fiber.
  - Architecture: pages/components -> hooks -> API client modules (does not use backend MVC).
  - Never bundle private keys, database credentials, or internal webhook secrets into `frontend/`.
- **`infra/` & `docker-compose.yml`:** PostgreSQL, MediaMTX configuration (`infra/mediamtx/mediamtx.yml`), key generation, and smoke scripts.

---

## 2. Engineering & Safety Invariants

1. **Cross-Service Contract Alignment:** Whenever you add or modify an API DTO, WebSocket frame, or event payload, keep `frontend/`, `backend/fastify/` (`src/lib/events.ts`), and `backend/fiber/` (`models/events.go`) in sync and covered by tests.
2. **Go Concurrency Discipline:**
   - Every goroutine must have an explicit exit mechanism (`context.Context` cancellation or quit channel) and leak-free cleanup.
   - Protect shared state using a single-owner actor loop (channel hub) or `sync.RWMutex`.
   - Use bounded per-client send queues and evict slow/stalled WebSocket clients so one dead connection never blocks room broadcasts.
   - Always test Go code with `go test -race` (when a C compiler is available; CI/Linux must run `-race`).
3. **Media & Webhook Security:**
   - MediaMTX webhook endpoints in `backend/` must authenticate requests via a shared secret/token (`X-VeloStream-Webhook-Secret`) and reject spoofed state changes.
   - Never log raw stream keys, passwords, JWT private keys, or session tokens.
4. **Windows / Cross-Platform Hygiene:**
   - Host tooling runs on Windows PowerShell while Docker containers run Linux. Keep shell/Docker scripts LF-terminated (`.gitattributes`), provide `.ps1` equivalents for host scripts when needed, and never hardcode OS-specific path separators in application code.
5. **No Shortcuts or Silent Failures:**
   - Never ignore errors (`err != nil` in Go, rejected Promises in TS/JS, HTTP error responses in `frontend/`).
   - Never weaken assertions, skip failing tests (`.skip`, `t.Skip()`), or mock out core behavior under test just to make a suite pass.
6. **Swagger / OpenAPI Documentation:**
   - Whenever you build a new API endpoint or modify any existing API (routes, params, request/response schemas, status codes, or auth requirements), create or update its Swagger/OpenAPI documentation in the same change.
   - Serve Fastify docs under `FASTIFY_PORT` and Fiber docs under `FIBER_PORT`. Keep generated specs in sync with implemented routes and DTOs.
   - If you created a new API endpoint, test the APIs via Swagger before finishing to confirm they work as expected and report the results.
7. **Cloudinary Storage Hierarchy (`VeloStream/`):**
   - In Cloudinary, all files, asset uploads, and subfolders must be placed under the `VeloStream/` root folder (e.g., `VeloStream/...`) rather than at the Cloudinary root.
8. **Frontend UI Conventions:**
   - Before designing or modifying UI components, layouts, or styling in `frontend/`, read and follow `.agents/skills/frontend-design/SKILL.md`.
   - **Feedback (`react-toastify`):** Whenever an API response, WebSocket event, or backend operation sends a user-facing message, use `react-toastify` with a configured `ToastContainer` matching the app's theme.
   - **Icons (`react-icons`):** Use `react-icons` (import from `react-icons` or shared wrappers in `frontend/src/components/Icons.tsx`) instead of writing custom inline SVG icons.
   - **Loading States (`LoadingSpinner`):** Use the reusable `LoadingSpinner` component (`frontend/src/components/LoadingSpinner.tsx`) flat blueish line animation whenever presenting asynchronous loading or hydration states (discovery, channel stage, creator lists); never fill loading states with dummy data or mock channels.

---

## 3. Mandatory Self-Testing & Verification Gate

**Before claiming any task is complete, you MUST test everything you wrote or modified and check the codebase for any hidden problems.** Do not rely on mental inspection alone—run real compilers, linters, tests, and builds after your final edit.

### A. Per-Component Verification Commands
Run every check for every component you touched:
- **Fastify (`backend/fastify/`):**
  - `npx prisma validate` (mandatory whenever `prisma/schema.prisma` changes)
  - `npm run typecheck -w @velostream/fastify`
  - `npm run lint -w @velostream/fastify`
  - `npm run test -w @velostream/fastify` (Vitest unit + Fastify `.inject()` integration tests)
  - `npm run build -w @velostream/fastify`
- **Fiber (`backend/fiber/`):**
  - `gofmt -l .` (must output nothing; format with `gofmt -w .` if needed)
  - `go vet ./...`
  - `go test -race -count=1 ./...` (or `go test -count=1 ./...` if `gcc` is unavailable on Windows host)
  - `go build ./...`
- **Frontend (`frontend/`):**
  - `npm run typecheck -w @velostream/frontend`
  - `npm run lint -w @velostream/frontend`
  - `npm run test -w @velostream/frontend` (Vitest + React Testing Library)
  - `npm run build -w @velostream/frontend` (`vite build`)
  - **Playwright E2E:** Run `npx playwright test` (inside `frontend/`) whenever UI views, routing, auth flows, API/WS client wiring, or playback/chat behaviors change. When modifying visual UI, verify layout/styles in a real browser with zero runtime errors.
- **Infrastructure (`docker-compose.yml`, `infra/`):**
  - `docker compose config -q` (must exit 0)
  - When modifying Dockerfiles, Compose, or media config, verify containers start healthy and run `infra/scripts/smoke-test.ps1`.
- **Full Cross-Stack:**
  - When a task spans multiple components or finishes a milestone, run `npm run verify:all` (covers all workspaces, Go vet/test/build, Prisma validation, Compose, and optional E2E).

### B. Problem-Hunting Checklist (Verify Before Reporting Done)
- [ ] **New & regression tests written:** Every new endpoint, hub behavior, React feature, or bug fix has targeted tests covering happy paths and edge cases (invalid auth, banned user eviction, malformed payloads, empty/error UI states).
- [ ] **No type, lint, or race errors:** `tsc`, ESLint, `go vet`, and `go test -race` pass with zero errors.
- [ ] **Runtime & integration sanity:** No broken imports, circular dependencies, stale Prisma clients (`npx prisma generate`), unmatched port/env names, or unhandled console/network errors in browser tests.
- [ ] **Diff & documentation check:** Inspect `git diff` so no stray debug logs or secret files are left behind; keep `.env.example` / `docs/project_structure_plan.md` updated if ports, env vars, or folder structure changed; verify Swagger/OpenAPI docs reflect all changes and test new endpoints via Swagger.
- [ ] **Clean up disposable test files:** Delete unnecessary one-off files created during testing (scratch outputs, throwaway fixtures, ad-hoc helper scripts). When you create a test file to test features you added, remove it after running tests if that test file will not be used again.

---

## 4. Reporting Standards

In your final response to the user:
- State the **exact commands executed after your final edit** and their **observed results** (pass counts, failures, or exact scope).
- If an external prerequisite prevents running a check (e.g., Docker Desktop is stopped so integration/E2E containers cannot boot), report that blocker clearly instead of guessing or claiming full pass.
