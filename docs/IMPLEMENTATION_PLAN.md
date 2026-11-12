
# Implementation Plan

## Phase 0 - Repository and safety baseline

- [x] Establish Next.js single-repository structure.
- [x] Define provider-independent VM adapter interface.
- [x] Add mock adapter only.
- [x] Document OCI target region and intended action mapping.
- [ ] Confirm Vercel Hobby usage is permitted for intended use.
- [ ] Create GitHub repository and protect the default branch.

**Exit criteria:** Local app builds; no live cloud calls or secrets exist in the repository.

## Phase 1 - UI and mock workflow

- [ ] Implement login screen and dashboard visual design.
- [ ] Display mock VM lifecycle state.
- [ ] Add Start, Stop and Restart confirmation dialogs.
- [ ] Display pending/success/failure states.
- [ ] Add activity history.
- [ ] Add responsive and accessibility checks.

**Exit criteria:** All flows work against mock data and are covered by tests.

## Phase 2 - Authentication

- [ ] Implement server-side administrator authentication.
- [ ] Hash password with Argon2id.
- [ ] Implement secure, revocable sessions.
- [ ] Add CSRF protection and login throttling.
- [ ] Add secure one-time admin provisioning.
- [ ] Require initial password rotation.

**Exit criteria:** Protected routes reject unauthenticated requests and tests cover session expiry/logout.

## Phase 3 - Supabase and persistence

- [ ] Create Supabase project.
- [ ] Configure transaction-pooler connection for serverless use.
- [ ] Apply Drizzle migrations.
- [ ] Persist users, VM metadata, operations and audit records.
- [ ] Add database availability/error handling.

**Exit criteria:** Operation and audit history survives redeployments and function restarts.

## Phase 4 - Mock operation orchestration

- [ ] Add idempotency handling.
- [ ] Add per-instance conflicting-operation guard.
- [ ] Add bounded status polling.
- [ ] Add stale-operation reconciliation.
- [ ] Simulate OCI timeout, network failure and transitional states.

**Exit criteria:** No duplicate or conflicting mock actions; timeouts do not cause blind retries.

## Phase 5 - Security review

- [ ] Review secrets exposure and server/client import boundaries.
- [ ] Review authorization in every route handler.
- [ ] Review cookie, CSRF and rate-limit controls.
- [ ] Review audit log redaction.
- [ ] Run dependency and static analysis checks.

**Exit criteria:** Security review signed off.

## Phase 6 - Separately approved OCI integration

This phase is intentionally blocked until the owner explicitly approves live OCI connectivity.

- [ ] Create dedicated OCI IAM service identity.
- [ ] Create and register API signing key.
- [ ] Confirm tenancy, compartment, region and instance OCIDs.
- [ ] Define and review least-privilege OCI policy.
- [ ] Implement OCI adapter behind existing interface.
- [ ] Test read-only status first.
- [ ] Test power actions against a non-production/test instance if available.
- [ ] Verify graceful stop/restart semantics and recovery.
- [ ] Add production secrets only after review.

**Exit criteria:** Explicit approval, security review, and successful controlled integration tests.

## Phase 7 - Deployment

- [ ] Connect repository to Vercel.
- [ ] Configure separate Preview and Production settings.
- [ ] Configure Supabase production connection.
- [ ] Apply migrations through a controlled process.
- [ ] Verify login, dashboard, audit history and mock mode.
- [ ] Confirm plan limits and acceptable-use terms.
- [ ] Deploy only after acceptance checklist passes.
