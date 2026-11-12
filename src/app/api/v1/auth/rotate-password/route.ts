import { NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  buildSessionCookieOptions,
  createAdminSession,
  requireAdminSession,
} from "@/lib/auth/session";
import { getStore } from "@/lib/database/store";
import { errorResponse, handleRouteError } from "@/lib/http/responses";
import { rotatePasswordSchema } from "@/lib/validators/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireAdminSession(request, {
      requireCsrf: true,
      allowPasswordRotationPending: true,
    });

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

    const parsed = rotatePasswordSchema.parse(rawBody);
    const valid = await verifyPassword(
      auth.user.passwordHash,
      parsed.currentPassword,
    );
    if (!valid) {
      const store = getStore();
      await store.createAuditLog({
        userId: auth.user.id,
        action: "AUTH_PASSWORD_ROTATE",
        outcome: "DENIED",
        requestId,
        metadata: { reason: "INVALID_CURRENT_PASSWORD" },
      });
      return errorResponse(
        401,
        "INVALID_CREDENTIALS",
        "Current password is incorrect.",
        requestId,
      );
    }

    if (parsed.currentPassword === parsed.newPassword) {
      return errorResponse(
        400,
        "PASSWORD_REUSE_NOT_ALLOWED",
        "New password must differ from the current password.",
        requestId,
      );
    }

    const newHash = await hashPassword(parsed.newPassword);
    const store = getStore();
    await store.updateUserPassword(auth.user.id, newHash, false);
    await store.revokeAllUserSessions(auth.user.id);
    const newSession = await createAdminSession(auth.user.id);

    await store.createAuditLog({
      userId: auth.user.id,
      action: "AUTH_PASSWORD_ROTATE",
      outcome: "SUCCESS",
      requestId,
      metadata: null,
    });

    const response = NextResponse.json({
      data: {
        rotated: true,
        csrfToken: newSession.csrfToken,
      },
    });
    const cookieOpts = buildSessionCookieOptions(newSession.expiresAt);
    response.cookies.set(cookieOpts.name, newSession.rawToken, {
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

