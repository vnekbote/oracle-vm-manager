
# Threat Model

## Assets

- Administrator account and sessions
- OCI API signing private key
- OCI tenancy/user/compartment/instance identifiers
- Supabase database credentials and stored records
- VM lifecycle control capability
- Audit records

## Trust boundaries

1. Browser to Vercel application over HTTPS.
2. Next.js server routes to Supabase.
3. Next.js server routes to OCI APIs (future integration).
4. GitHub and Vercel deployment pipeline.

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| Credential guessing | Argon2id, rate limiting, generic login errors |
| Session theft | Secure HttpOnly SameSite cookies, HTTPS, expiry and revocation |
| CSRF | CSRF token/origin validation on mutations |
| Unauthorized power action | Server-side session and role checks on every route |
| Secret leakage | Server-only environment variables, redacted logs, secret scanning |
| Arbitrary instance targeting | Fixed server-side instance configuration |
| Duplicate/conflicting actions | Idempotency key and per-instance lock |
| OCI key compromise | Dedicated IAM user, least privilege, rotation and restricted access |
| Database compromise | Least-privilege DB role, TLS, RLS where client access exists |
| Dependency compromise | Lockfile, dependency review and automated scanning |
| Stale state | Authoritative OCI reconciliation; show UNKNOWN/stale indicator |

## Security invariants

- No credentials or private keys in source control.
- No OCI secret in client bundles or browser storage.
- No live OCI call from the browser.
- No arbitrary OCID accepted from client requests.
- No automatic forceful fallback after graceful-operation timeout.
- No action without authentication, authorization, validation and audit record.
- Mock mode is the default until live integration is separately approved.
