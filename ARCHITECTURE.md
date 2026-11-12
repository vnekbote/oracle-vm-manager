
# Architecture - Oracle VM Manager

**Status:** Approved design baseline; live OCI integration not authorized by this scaffold.

## 1. Purpose and scope

Provide a public web interface for one administrator, Vinay Ekbote, to view and manage one existing OCI Compute instance in Phoenix (`us-phoenix-1`). The guest OS is Oracle Linux. Supported product actions are Start, graceful Stop, graceful Restart, and status monitoring. The application must not display the VM's public IP.

Out of scope: creating/deleting instances, resizing, changing networking, managing multiple instances, shell/SSH access, and exposing the OCI console.

## 2. System architecture

Browser -> Vercel-hosted Next.js application -> server-side application services -> (a) Supabase PostgreSQL for users, operations and audit records; (b) an OCI adapter for instance state and power actions.

The browser must never call OCI directly. OCI credentials, database service credentials, password hashes and session secrets must remain server-side.

## 3. Technology choices

| Layer | Technology | Rationale |
|---|---|---|
| Web application | Next.js App Router + TypeScript | One repository for UI and server routes |
| Styling | Tailwind CSS | Consistent responsive UI |
| UI primitives | Accessible component primitives | Keyboard and screen-reader support |
| Validation | Zod | Runtime validation at API boundaries |
| Database | Supabase PostgreSQL | Managed persistent storage |
| ORM | Drizzle ORM | Typed schema and migrations |
| Hosting | Vercel | Managed Next.js deployment |
| Cloud integration (future) | Official OCI JavaScript SDK | Provider-supported API integration |
| Tests | Vitest + Testing Library | Unit and component testing; add Playwright for E2E |

## 4. Authentication and authorization

Single administrator only. Provision the account through a secure one-time administrative process. Username/display identity: `Vinay Ekbote`. Do not hardcode the supplied password. Generate an Argon2id password hash through a secure provisioning workflow; require password rotation before production.

Use server-managed sessions and secure, HttpOnly, SameSite cookies. Enforce CSRF protections on state-changing requests, login throttling, session expiry, logout invalidation, and authorization checks inside every protected route handler. Middleware alone is not an authorization boundary.

## 5. OCI integration boundary

The application service depends on an interface, not an SDK implementation:

- `getInstanceStatus()`
- `startInstance()`
- `stopInstanceGracefully()`
- `restartInstanceGracefully()`

This scaffold includes only a mock implementation. A future OCI adapter must use a dedicated least-privilege IAM identity, server-side API signing-key handling, configured region `us-phoenix-1`, and a fixed instance OCID supplied through protected configuration. Do not accept an arbitrary instance OCID from the browser.

Expected OCI action mapping after approval:
- Start: `START`
- Graceful stop: `SOFTSTOP`
- Graceful restart: `SOFTRESET`

A submitted OCI action is not proof that the target lifecycle state has been reached. Reconcile using authoritative instance state.

## 6. State and operation handling

Lifecycle states include `RUNNING`, `STOPPED`, `STARTING`, `STOPPING`, `TERMINATING`, `TERMINATED`, and `UNKNOWN`. The cloud provider is authoritative; database state is an operation/audit record, not a substitute for live state.

Persist each operation before submitting an infrastructure request. Use idempotency keys, reject conflicting actions, and reconcile timeouts before retrying. Never automatically fall back from graceful to forceful shutdown.

## 7. Data model

- `users`: administrator identity, password hash, active flag and timestamps.
- `vm_instances`: protected instance metadata; do not store private keys.
- `vm_operations`: action, status, actor, idempotency key, provider request metadata and timestamps.
- `audit_logs`: actor, action, outcome, request ID and timestamp.

Use UTC timestamps. Do not log passwords, cookies, tokens, private keys, or full secret-bearing provider responses.

## 8. API contract

Base path: `/api/v1`.

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /vm/status`
- `POST /vm/start`
- `POST /vm/stop`
- `POST /vm/restart`
- `GET /operations/:id`
- `GET /audit`

All routes except login require an authenticated session. VM actions accept an idempotency key; target instance identity is server-side configuration.

## 9. Deployment

Deploy the Next.js application to Vercel and use Supabase PostgreSQL. Use a transaction pooler for serverless database access where appropriate. Run migrations as a controlled deployment step, not opportunistically on every function invocation. Keep Preview credentials separate from Production. Do not put real OCI credentials in Preview.

Vercel functions are request-oriented and have plan-dependent execution limits. Do not hold an HTTP request open while waiting for a VM transition. Submit an operation, persist its identifier, and poll status/state through subsequent requests. For longer-running orchestration, introduce a durable job/queue service only after requirements and hosting constraints are reviewed.

## 10. Security and operational requirements

- Least-privilege OCI IAM policy scoped to the required compartment/instance where OCI policy granularity permits.
- Server-only secrets and imports.
- Secure cookie/session configuration.
- CSRF protection, rate limiting and input validation.
- Idempotency and per-instance operation locking.
- Bounded polling and retry with backoff.
- Clear stale/unknown state indication during network failure.
- Structured redacted logs and audit trail.
- No public IP display.
- No live OCI calls in this initial scaffold.
