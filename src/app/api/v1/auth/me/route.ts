import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { handleRouteError } from "@/lib/http/responses";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireAdminSession(request, {
      allowPasswordRotationPending: true,
    });

    return NextResponse.json({
      data: {
        user: {
          id: auth.user.id,
          username: auth.user.username,
          displayName: auth.user.displayName,
          role: auth.user.role,
          mustRotatePassword: auth.user.mustRotatePassword,
        },
        csrfToken: auth.csrfToken,
      },
    });
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}

