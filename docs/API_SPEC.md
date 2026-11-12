
# API Specification

Base path: `/api/v1`. JSON request and response bodies. All endpoints except login require a valid server-side session.

## Authentication

### POST `/auth/login`

Request:
```json
{ "username": "Vinay Ekbote", "password": "[PASSWORD]" }
```

Response: `200` with minimal user identity and session cookie set as HttpOnly/Secure/SameSite. Never return password hash or session secret in JSON.

### POST `/auth/logout`

Invalidates the current session and clears its cookie.

### GET `/auth/me`

Returns:
```json
{ "user": { "displayName": "Vinay Ekbote", "role": "ADMIN" } }
```

## VM

### GET `/vm/status`

Returns:
```json
{
  "instanceStatus": "RUNNING",
  "source": "MOCK",
  "checkedAt": "2026-01-01T00:00:00.000Z",
  "stale": false
}
```

`source` must be `MOCK` until live OCI integration is explicitly approved.

### POST `/vm/start`, `/vm/stop`, `/vm/restart`

Request:
```json
{ "idempotencyKey": "[UNIQUE_REQUEST_ID]" }
```

The target instance is selected from server-side configuration. Client-supplied OCIDs are rejected.

Response:
```json
{
  "operation": {
    "id": "[OPERATION_ID]",
    "action": "START",
    "status": "SUBMITTED"
  }
}
```

### GET `/operations/:id`

Returns the persisted operation status and timestamps. The caller must be authenticated and the operation must belong to the configured administrator.

### GET `/audit`

Returns a paginated, redacted activity history. No secrets or raw private provider responses are returned.

## Error format

```json
{
  "error": {
    "code": "OPERATION_IN_PROGRESS",
    "message": "A VM operation is already in progress.",
    "requestId": "[REQUEST_ID]"
  }
}
```

## HTTP status codes

| Code | Meaning |
|---|---|
| 400 | Invalid request |
| 401 | Unauthenticated |
| 403 | Forbidden |
| 404 | Operation not found |
| 409 | Invalid state transition or operation conflict |
| 429 | Rate limited |
| 500 | Internal application error |
| 502 | Provider integration error |
| 503 | Provider/database unavailable |
| 504 | Provider timeout |
