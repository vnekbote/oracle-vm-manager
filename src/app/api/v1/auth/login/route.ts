import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { resolveConfiguredAdmin } from "@/lib/auth/provisioning";
import {
  buildSessionCookieOptions,
  createAdminSession,
} from "@/lib/auth/session";
import { getStore } from "@/lib/database/store";
import { errorResponse, handleRouteError } from "@/lib/http/responses";
import { verifySameOrigin } from "@/lib/security/csrf";
import { getClientIp, loginRateLimiter } from "@/lib/security/rate-limit";
import { loginSchema } from "@/lib/validators/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    if (!verifySameOrigin(request)) {
      return errorResponse(
        403,
        "CSRF_ORIGIN_INVALID",
        "Invalid request origin.",
        requestId,
      );
    }

    const clientIp = getClientIp(request);
    const rate = loginRateLimiter.check(`login:${clientIp}`);
    if (!rate.allowed) {
      return errorResponse(
        429,
        "RATE_LIMITED",
        "Too many sign-in attempts. Please try again later.",
        requestId,
        { "Retry-After": String(rate.retryAfterSeconds) },
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return errorResponse(
        400,
        "INVALID_JSON",
        "Request body must be valid JSON.",
        requestId,
      );
    }

    const parsed = loginSchema.parse(rawBody);
    const store = getStore();
    const admin = await resolveConfiguredAdmin();

    if (
      !admin ||
      !admin.isActive ||
      admin.username.toLowerCase() !== parsed.username.toLowerCase()
    ) {
      await store.createAuditLog({
        userId: admin?.id ?? null,
        action: "AUTH_LOGIN",
        outcome: "DENIED",
        requestId,
        metadata: { reason: "INVALID_CREDENTIALS" },
      });
      return errorResponse(
        401,
        "INVALID_CREDENTIALS",
        "Invalid username or password.",
        requestId,
      );
    }

    const valid = await verifyPassword(admin.passwordHash, parsed.password);
    if (!valid) {
      await store.createAuditLog({
        userId: admin.id,
        action: "AUTH_LOGIN",
        outcome: "DENIED",
        requestId,
        metadata: { reason: "INVALID_CREDENTIALS" },
      });
      return errorResponse(
        401,
        "INVALID_CREDENTIALS",
        "Invalid username or password.",
        requestId,
      );
    }

    const session = await createAdminSession(admin.id);

    await store.createAuditLog({
      userId: admin.id,
      action: "AUTH_LOGIN",
      outcome: "SUCCESS",
      requestId,
      metadata: { mustRotatePassword: admin.mustRotatePassword },
    });

    const response = NextResponse.json({
      data: {
        user: {
          id: admin.id,
          username: admin.username,
          displayName: admin.displayName,
          role: admin.role,
          mustRotatePassword: admin.mustRotatePassword,
        },
        csrfToken: session.csrfToken,
      },
    });

    const cookieOpts = buildSessionCookieOptions(session.expiresAt);
    response.cookies.set(cookieOpts.name, session.rawToken, {
      httpOnly: cookieOpts.httpOnly,
      sameSite: cookieOpts.sameSite,
      secure: cookieOpts.secure,
      path: cookieOpts.path,
      expires: cookieOpts.expires,
    });

    return response;
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}

