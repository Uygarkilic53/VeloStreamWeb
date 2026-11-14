# VeloStream Agent Operating Manual (`AGENTS.md`)

You are working on **VeloStream**, a high-concurrency, polyglot live streaming platform (React + TypeScript frontend, Node.js/Fastify + TypeScript API, Go + Fiber real-time service, MediaMTX media router, and PostgreSQL).

---

## 1. Repository Layout & Service Boundaries

Respect strict separation between **frontend**, **backend**, and **infra**:

- `frontend/` (**The Stage**): Vite + React + TypeScript + Tailwind CSS + Vitest + Playwright.
  - Handles webcam/mic capture (WebRTC WHIP), HLS playback (`hls.js`), REST requests to `fastify`, and WebSocket chat to `fiber`.
  - **UI Rule:** Before designing or modifying UI components, layouts, or styling in `frontend/`, read and follow `.agents/skills/frontend-design/SKILL.md`.
  - **Toast Rule:** Use `react-toastify` in `frontend/` whenever displaying user-facing messages sent from an API (see Section 3, item 8).
  - **Icons Rule:** Use `react-icons` whenever icons are needed across `frontend/` instead of writing custom inline SVG icons (see Section 3, item 10).
  - **Loading Rule:** Use the reusable `LoadingSpinner` component (`frontend/src/components/LoadingSpinner.tsx`) whenever presenting asynchronous loading or hydration states, designed as a flat line like loading with blueish color, and never fill loading states with dummy data (see Section 3, item 11).
  - Never bundle private keys, database credentials, or internal webhook secrets into `frontend/`.
- `backend/fastify/` (**The Brain**): Node.js + Fastify + TypeScript + Prisma ORM.
  - **Sole owner of PostgreSQL schema and migrations** (`backend/fastify/prisma/`).
  - Handles user accounts, asymmetric JWT signing (`EdDSA`/`RS256`), stream key generation, channel profiles, and moderation commands (bans/unbans).
  - **Cloudinary Rule:** All Cloudinary files and folders must be placed under the `VeloStream` root folder (see Section 3, item 9).
- `backend/fiber/` (**The Muscle**): Go + Fiber + `pgx/v5`.
  - Handles high-concurrency WebSocket chat rooms, MediaMTX webhooks, and chat persistence/queries.
  - **Never** write SQL DDL migrations in Go; query/write only tables managed by `backend/fastify/prisma/`.
  - **Never** call `fastify` synchronously over HTTP on per-message or WebSocket-connect hot paths; verify JWTs locally with the asymmetric public key/JWKS.
- `infra/` & `docker-compose.yml`: PostgreSQL, MediaMTX configuration (`infra/mediamtx/mediamtx.yml`), key generation, and smoke scripts.

---

## 2. Code Architecture — Models / Controllers / Routes (MVC)

Both backend services follow a **thin-routes, lean-controllers, rich-models** MVC layout with `app` separated from `server`/`main` startup so HTTP routes stay testable in memory without binding a port.

### A. Fastify Service (`backend/fastify/`) — TypeScript / Fastify

| Directory / File | Layer | Rules |
|---|---|---|
| `src/server.ts` | **Entrypoint** | Loads env, connects Postgres, builds app via `buildApp()`, calls `app.listen()`, handles `SIGINT`/`SIGTERM`. |
| `src/app.ts` | **App Factory** | Registers CORS, error handler, and routes via `registerAllRoutes()` without calling `listen()`. Testable with `app.inject()`. |
| `src/config/` | **Config** | Env validation (Zod), `.env` loader, Postgres setup. |
| `src/routes/` | **Routes** | HTTP wiring only — attaches `preHandler` hooks and maps paths to controller functions. No business logic or DB calls. |
| `src/controllers/` | **Controllers** | Request orchestration and business logic using injected models and `lib/` utilities. Controllers never import `@prisma/client` directly. |
| `src/middlewares/` | **Middlewares** | Fastify `preHandler` hooks (JWT auth verification). |
| `src/models/` | **Models** | All Prisma queries, transactions, unique-constraint mapping, and test stores. |
| `src/schemas/` | **Schemas** | Shared Zod validation schemas & TS DTOs. |
| `src/lib/` | **Utilities** | Password hashing, JWT signing, stream-key generation, error classes, event publisher abstraction. |

### B. Fiber Service (`backend/fiber/`) — Go / Fiber

The Go service mirrors the Node.js MVC layout closely while enforcing strict one-way Go package imports (`main` -> `app` -> `routes` -> `controllers` + `middlewares` -> `services` + `models`):

| Directory / File | Layer | Rules |
|---|---|---|
| `main.go` | **Entrypoint** | Loads env/config, connects Postgres, starts background `HubService`, builds `*fiber.App` via `app.New()`, calls `Listen()`, and shuts down gracefully. |
| `app/app.go` | **App Factory** | Configures `fiber.New(...)`, `recover`, `cors`, error handler, and calls `routes.RegisterAll(...)` without calling `Listen()`. Testable via `app.Test(req)`. |
| `config/` | **Config** | Env parsing (`LoadFromEnv`, `.env` file loading) and Postgres `pgxpool` setup. |
| `routes/` | **Routes** | Route registration (`routes.go`, `health_routes.go`, `webhook_routes.go`, `chat_routes.go`) mapping HTTP/WS paths and middlewares to controllers. |
| `controllers/` | **Controllers** | Fiber request & WebSocket handlers (`HealthController`, `WebhookController`, `ChatController`). No raw SQL queries directly in controllers. |
| `middlewares/` | **Middlewares** | Fiber middleware guards (`RequireWebSocketAuth`) verifying JWTs locally and storing claims in `c.Locals`. |
| `models/` | **Models** | Shared event/DTO structs (`events.go`) and `pgxpool` data models (`chat_model.go`). Never run DDL migrations here. |
| `services/` | **Services** | Domain engines and infrastructure workers: `JwtService` and concurrency-safe `HubService`. |
| `tests/` | **Tests** | Black-box unit and `app.Test()` integration tests covering endpoints, config parsing, JWT verification, and `-race`-clean Hub behavior. |

### C. Frontend (`frontend/`) — React

The frontend does **not** use backend MVC. Continue using the existing pattern: pages/components -> hooks -> API client modules.

---

## 3. Engineering & Safety Invariants

1. **Cross-Service Contract Alignment:** Whenever you add or modify an API DTO, WebSocket frame, or event payload:
   - Keep `frontend/`, `backend/fastify/` (`src/lib/events.ts`), and `backend/fiber/` (`models/events.go`) in sync and covered by tests.
2. **Go Concurrency Discipline:**
   - Every goroutine must have an explicit exit mechanism (`context.Context` cancellation or quit channel) and leak-free cleanup.
   - Protect shared state using a single-owner actor loop (channel hub) or `sync.RWMutex`.
   - Use bounded per-client send queues and evict slow/stalled WebSocket clients so one dead connection never blocks room broadcasts.
   - Always test Go code with `go test -race` (when a C compiler is available; CI/Linux must run `-race`).
3. **App Factory Testability & Validation:**
   - Keep `buildApp()` (`backend/fastify/src/app.ts`) separate from `server.ts` (`listen()`), and `app.New()` (`backend/fiber/app/app.go`) separate from `main.go` (`Listen()`), so integration tests run cleanly in memory.
   - Validate all route params, queries, bodies, and startup environment variables strictly.
4. **Media & Webhook Security:**
   - MediaMTX webhook endpoints in `backend/` must authenticate requests via a shared secret/token (`X-VeloStream-Webhook-Secret`) and reject spoofed state changes.
   - Never log raw stream keys, passwords, JWT private keys, or session tokens.
5. **Windows / Cross-Platform Hygiene:**
   - Host tooling runs on Windows PowerShell while Docker containers run Linux. Keep shell/Docker scripts LF-terminated (`.gitattributes`), provide `.ps1` equivalents for host scripts when needed, and never hardcode OS-specific path separators in application code.
6. **No Shortcuts or Silent Failures:**
   - Never ignore errors (`err != nil` in Go, rejected Promises in TS/JS, HTTP error responses in `frontend/`).
   - Never weaken assertions, skip failing tests (`.skip`, `t.Skip()`), or mock out the core behavior under test just to make a suite pass.
7. **Swagger / OpenAPI Documentation:**
   - Whenever you build a new API endpoint or modify any existing API (routes, params, request/response schemas, status codes, or auth requirements), you **must** create or update its Swagger/OpenAPI documentation in the same change.
   - Serve each service's Swagger documentation under its own port: Fastify API docs under the Fastify port (`FASTIFY_PORT`) and Fiber API docs under the Fiber port (`FIBER_PORT`). Keep generated specs/annotations in sync with the implemented routes and DTOs.
   - If you created a new API endpoint, test the APIs via Swagger before finishing to confirm they work as expected and report the results.
8. **API User Feedback (`react-toastify`):**
   - Whenever an API response, WebSocket event, or backend operation sends a user-facing message (such as success confirmations, errors, warnings, or status notifications) to display to users in `frontend/`, use `react-toastify` to render the related toast notifications (with a configured `ToastContainer` matching the app's theme).
9. **Cloudinary Storage Hierarchy (`VeloStream/`):**
   - In Cloudinary, we work under the `VeloStream` folder. Whenever adding a new file, asset upload, or subfolder in Cloudinary, always place it under `VeloStream` (e.g., `VeloStream/...`) rather than at the Cloudinary root.
10. **UI Icons (`react-icons`):**
   - Use `react-icons` whenever icons are needed throughout `frontend/` (import from `react-icons` or shared wrappers in `frontend/src/components/Icons.tsx` backed by `react-icons`) rather than hand-authoring custom inline SVG icon components. Use icons purposefully where they improve clarity and make actions/navigation scannable without cluttering the UI.
11. **Loading States (`LoadingSpinner`):**
   - Use the reusable `LoadingSpinner` component (`frontend/src/components/LoadingSpinner.tsx`) whenever displaying asynchronous loading or data hydration states across `frontend/` (such as live channel discovery, channel stage loading, or creator lists). Design loading states with the flat line blueish loading animation; never use dummy data, mock channels, or fallback records as fillers during loading states.

---

## 4. Mandatory Self-Testing & Verification Gate

**Before claiming any task is complete, you MUST test everything you wrote or modified and check the codebase for any hidden problems.** Do not rely on mental inspection alone—run real compilers, linters, tests, and builds after your final edit.

### A. Per-Component Verification Commands

Run every check for every component you touched:

1. **Fastify (`backend/fastify/`)**
   - `npx prisma validate` (mandatory whenever `prisma/schema.prisma` changes)
   - `npm run typecheck -w @velostream/fastify`
   - `npm run lint -w @velostream/fastify`
   - `npm run test -w @velostream/fastify` (Vitest unit + Fastify `.inject()` integration tests)
   - `npm run build -w @velostream/fastify`
2. **Fiber (`backend/fiber/`)**
   - Run from `backend/fiber/`:
     - `gofmt -l .` (must output nothing; format with `gofmt -w .` if needed)
     - `go vet ./...`
     - `go test -race -count=1 ./...` (or `go test -count=1 ./...` if `gcc` is unavailable on Windows host)
     - `go build ./...`
3. **Frontend (`frontend/`)**
   - `npm run typecheck -w @velostream/frontend`
   - `npm run lint -w @velostream/frontend`
   - `npm run test -w @velostream/frontend` (Vitest + React Testing Library)
   - `npm run build -w @velostream/frontend` (`vite build`)
   - **Playwright E2E:** Run `npx playwright test` (inside `frontend/`) whenever UI views, routing, auth flows, API/WS client wiring, or playback/chat behaviors change. When modifying visual UI, verify layout/styles in a real browser (and inspect console/network errors for zero runtime failures).
4. **Infrastructure (`docker-compose.yml`, `infra/`)**
   - `docker compose config -q` (must exit 0)
   - When modifying Dockerfiles, `docker-compose.yml`, `mediamtx.yml`, or startup config, verify containers start healthy and run the smoke script (`infra/scripts/smoke-test.ps1`).

### B. Full Cross-Stack Verification

When a task spans multiple components or finishes a milestone:
- Run `npm run verify:all` covering all workspaces, Go (`go vet`, `go test`, `go build`), Prisma validation, and Compose validation, plus Playwright E2E when applicable.

### C. Problem-Hunting Checklist (Verify Before Reporting Done)

Every time you finish writing or editing code, explicitly verify:
- [ ] **New & regression tests written:** Every new endpoint, hub behavior, React feature, or bug fix has targeted automated tests covering both happy paths and failure/edge cases (invalid auth, banned user eviction, malformed payloads, empty/error UI states).
- [ ] **No type, lint, or race errors:** `tsc`, ESLint, `go vet`, and `go test -race` pass with zero errors.
- [ ] **Runtime & integration sanity:** No broken imports, circular dependencies, stale generated Prisma clients (`npx prisma generate`), unmatched port/env names, or unhandled console/network errors in browser tests.
- [ ] **Diff & documentation check:** Inspect `git status` / `git diff` (when in a Git repo) so no stray debug logs, temporary files, or secret files are left behind, keep `.env.example` / `docs/project_structure_plan.md` updated if ports, env vars, or folder structure changed, verify Swagger/OpenAPI docs on the Fastify and Fiber ports reflect any new or modified APIs, and if a new API endpoint was created, test it via Swagger and report the results.
- [ ] **Clean up disposable test files:** Delete any unnecessary one-off files created during testing that will not be used again (such as scratch outputs, ad-hoc helper scripts, throwaway fixtures, logs, or screenshots), while keeping actual test suites and reusable testing scripts.
- [ ] **Remove one-off feature test files:** When you create a test file to test features you added, you must remove it after running your tests if that test file will not be used again.

---

## 5. Reporting Standards

In your final response to the user:
- State the **exact commands executed after your final edit** and their **observed results** (pass counts, failures, or exact scope).
- If an external prerequisite prevents running a check (for example, Docker Desktop is stopped so integration/E2E containers cannot boot), report that blocker clearly instead of guessing or claiming full pass.
