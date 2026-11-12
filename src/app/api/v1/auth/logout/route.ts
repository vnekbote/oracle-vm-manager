import { NextResponse } from "next/server";
import {
  requireAdminSession,
  revokeCurrentSession,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { getStore } from "@/lib/database/store";
import { handleRouteError } from "@/lib/http/responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireAdminSession(request, {
      requireCsrf: true,
      allowPasswordRotationPending: true,
    });

    await revokeCurrentSession(auth.sessionId);
    const store = getStore();
    await store.createAuditLog({
      userId: auth.user.id,
      action: "AUTH_LOGOUT",
      outcome: "SUCCESS",
      requestId,
      metadata: null,
    });

    const response = NextResponse.json({ data: { loggedOut: true } });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}

