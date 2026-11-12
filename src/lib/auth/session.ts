import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getAppConfig } from "@/lib/config/env";
import { getStore, type UserRecord } from "@/lib/database/store";
import { logStructured } from "@/lib/security/redact";
import {
  CSRF_HEADER_NAME,
  generateCsrfToken,
  verifyCsrfToken,
  verifySameOrigin,
} from "@/lib/security/csrf";

export const SESSION_COOKIE_NAME = "ovm_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export function hashSessionToken(rawToken: string): string {
  const { authSecret } = getAppConfig();
  return createHash("sha256")
    .update(`${authSecret}:${rawToken}`)
    .digest("hex");
}

export interface AuthenticatedContext {
  sessionId: string;
  user: UserRecord;
  csrfToken: string;
}

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export async function createAdminSession(userId: string): Promise<{
  rawToken: string;
  sessionId: string;
  expiresAt: Date;
  csrfToken: string;
}> {
  const store = getStore();
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const session = await store.createSession({
    userId,
    tokenHash,
    expiresAt,
  });

  return {
    rawToken,
    sessionId: session.id,
    expiresAt,
    csrfToken: generateCsrfToken(session.id),
  };
}

export function buildSessionCookieOptions(expiresAt: Date) {
  const { nodeEnv } = getAppConfig();
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: nodeEnv === "production",
    path: "/",
    expires: expiresAt,
  };
}

export async function getSessionFromCookies(): Promise<AuthenticatedContext | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) {
    logStructured("warn", "auth.no_session_cookie");
    return null;
  }

  const store = getStore();
  const tokenHash = hashSessionToken(rawToken);
  const match = await store.findActiveSessionByTokenHash(tokenHash);
  if (!match) {
    logStructured("warn", "auth.session_not_found_or_expired");
    return null;
  }

  // Throttle lastSeenAt updates to at most once every 5 minutes to avoid extra DB writes on every poll.
  if (Date.now() - match.session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await store.touchSession(match.session.id);
  }

  return {
    sessionId: match.session.id,
    user: match.user,
    csrfToken: generateCsrfToken(match.session.id),
  };
}

export async function requireAdminSession(
  request: Request,
  options: { requireCsrf?: boolean; allowPasswordRotationPending?: boolean } = {},
): Promise<AuthenticatedContext> {
  const context = await getSessionFromCookies();
  if (!context) {
    throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  if (!context.user.isActive || context.user.role !== "ADMIN") {
    throw new AuthError(403, "FORBIDDEN", "Administrator access is required.");
  }

  if (options.requireCsrf) {
    if (!verifySameOrigin(request)) {
      throw new AuthError(403, "CSRF_ORIGIN_INVALID", "Invalid request origin.");
    }
    const providedCsrf = request.headers.get(CSRF_HEADER_NAME);
    if (!verifyCsrfToken(context.sessionId, providedCsrf)) {
      throw new AuthError(403, "CSRF_TOKEN_INVALID", "Invalid or missing CSRF token.");
    }
  }

  if (
    !options.allowPasswordRotationPending &&
    context.user.mustRotatePassword
  ) {
    throw new AuthError(
      403,
      "PASSWORD_ROTATION_REQUIRED",
      "Initial password rotation is required before performing VM operations.",
    );
  }

  return context;
}

export async function revokeCurrentSession(sessionId: string): Promise<void> {
  const store = getStore();
  await store.revokeSession(sessionId);
}

