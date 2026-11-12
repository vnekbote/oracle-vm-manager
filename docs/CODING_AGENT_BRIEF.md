
# Coding Agent Brief - Oracle VM Manager

You are implementing the approved architecture in this repository.

## Non-negotiable constraints

1. Do not commit, push, or deploy unless the owner explicitly authorizes that action.
2. Do not connect to, start, stop, restart, modify, or otherwise operate the live OCI VM.
3. Keep `VM_ADAPTER_MODE=mock`. Do not implement live OCI connectivity in this task.
4. Do not invent or insert real credentials. Keep placeholders in `.env.example`.
5. Never print secrets or ask the owner to paste private keys into chat.
6. Do not accept a client-provided instance OCID.
7. Do not claim authentication is secure until server-side sessions, password hashing, CSRF protections, rate limiting and authorization are implemented and tested.
8. Do not mark unimplemented endpoints as complete.

## Work to perform

- Inspect the entire repository before editing.
- Resolve dependency/configuration inconsistencies and make the project build.
- Implement the UI and mock workflow.
- Implement secure administrator authentication using a server-side session design and Argon2id.
- Implement Supabase persistence and Drizzle migrations.
- Implement operation idempotency, conflict prevention, audit records and state reconciliation in mock mode.
- Add unit, integration and E2E tests.
- Add README instructions and document all remaining TODOs.
- Run install, lint, typecheck, tests and production build.
- Report exact commands and results, including failures.
- Do not silently weaken security or remove tests to make checks pass.

## Approved target configuration

- Administrator display/login identity: Vinay Ekbote
- OCI region: `us-phoenix-1`
- Guest OS: Oracle Linux
- Database: Supabase PostgreSQL
- Hosting target: Vercel Hobby, subject to plan terms
- Planned OCI actions for a later separately approved phase: `START`, `SOFTSTOP`, `SOFTRESET`
- Public IP display: disabled

## Completion report

Provide:
1. Files created/modified.
2. Architecture decisions implemented.
3. Security controls implemented and tested.
4. Commands executed and pass/fail results.
5. Remaining TODOs and risks.
6. Explicit confirmation that no live OCI calls were made.
7. Explicit confirmation that no commit, push or deployment occurred.
