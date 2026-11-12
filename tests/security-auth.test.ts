import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { hashSessionToken } from "../src/lib/auth/session";
import { InMemoryPersistenceStore } from "../src/lib/database/store";
import { generateCsrfToken, verifyCsrfToken } from "../src/lib/security/csrf";
import { SlidingWindowRateLimiter } from "../src/lib/security/rate-limit";
import { redactMetadata } from "../src/lib/security/redact";
import { vmActionRequestSchema } from "../src/lib/validators/schemas";

describe("Security controls & authentication primitives", () => {
  let store: InMemoryPersistenceStore;

  beforeEach(() => {
    store = new InMemoryPersistenceStore();
  });

  it("hashes and verifies passwords with Argon2id", async () => {
    const sample = `TestPass-${crypto.randomUUID()}!1A`;
    const digest = await hashPassword(sample);
    expect(digest).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(digest, sample)).toBe(true);
    expect(await verifyPassword(digest, "wrong-password")).toBe(false);
  });

  it("validates CSRF tokens bound to session ID", () => {
    const sessionId = crypto.randomUUID();
    const token = generateCsrfToken(sessionId);
    expect(verifyCsrfToken(sessionId, token)).toBe(true);
    expect(verifyCsrfToken(sessionId, "tampered-token")).toBe(false);
    expect(verifyCsrfToken(crypto.randomUUID(), token)).toBe(false);
    expect(verifyCsrfToken(sessionId, null)).toBe(false);
  });

  it("enforces login rate limiting", () => {
    const limiter = new SlidingWindowRateLimiter(3, 60_000);
    expect(limiter.check("ip-1", 1000).allowed).toBe(true);
    expect(limiter.check("ip-1", 2000).allowed).toBe(true);
    expect(limiter.check("ip-1", 3000).allowed).toBe(true);
    const fourth = limiter.check("ip-1", 4000);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
    // Different key still allowed
    expect(limiter.check("ip-2", 4000).allowed).toBe(true);
  });

  it("redacts sensitive keys from audit metadata", () => {
    const redacted = redactMetadata({
      operationId: "op-1",
      password: "secret",
      passwordHash: "$argon2id$...",
      ociPrivateKey: "-----BEGIN PRIVATE KEY-----",
      nested: { sessionToken: "abc", region: "us-phoenix-1" },
    });

    expect(redacted?.operationId).toBe("op-1");
    expect(redacted?.password).toBe("[REDACTED]");
    expect(redacted?.passwordHash).toBe("[REDACTED]");
    expect(redacted?.ociPrivateKey).toBe("[REDACTED]");
    expect((redacted?.nested as Record<string, unknown>)?.sessionToken).toBe(
      "[REDACTED]",
    );
    expect((redacted?.nested as Record<string, unknown>)?.region).toBe(
      "us-phoenix-1",
    );
  });

  it("rejects client-supplied instanceOcid in VM action requests", () => {
    const valid = vmActionRequestSchema.safeParse({
      idempotencyKey: "req-12345678",
    });
    expect(valid.success).toBe(true);

    const rejected = vmActionRequestSchema.safeParse({
      idempotencyKey: "req-12345678",
      instanceOcid: "ocid1.instance.oc1.phx.attacker",
    });
    expect(rejected.success).toBe(false);
  });

  it("supports session creation, expiry check, and revocation", async () => {
    const admin = await store.upsertAdminUser({
      username: "Vinay Ekbote",
      displayName: "Vinay Ekbote",
      passwordHash: "hash",
      mustRotatePassword: false,
    });

    const rawToken = "random-session-token";
    const tokenHash = hashSessionToken(rawToken);
    const future = new Date(Date.now() + 60_000);
    const session = await store.createSession({
      userId: admin.id,
      tokenHash,
      expiresAt: future,
    });

    const found = await store.findActiveSessionByTokenHash(tokenHash);
    expect(found?.user.username).toBe("Vinay Ekbote");

    // Expired check
    const expired = await store.findActiveSessionByTokenHash(
      tokenHash,
      new Date(Date.now() + 120_000),
    );
    expect(expired).toBeNull();

    // Revocation check
    await store.revokeSession(session.id);
    const revoked = await store.findActiveSessionByTokenHash(tokenHash);
    expect(revoked).toBeNull();
  });
});

