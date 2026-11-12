import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { handleRouteError, errorResponse } from "@/lib/http/responses";
import { getClientIp, mutationRateLimiter } from "@/lib/security/rate-limit";
import { submitVmAction } from "@/lib/services/vm.service";
import { vmActionRequestSchema } from "@/lib/validators/schemas";
import type { VmAction } from "@/types/vm";

export async function handleVmActionRequest(
  request: Request,
  action: VmAction,
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireAdminSession(request, { requireCsrf: true });

    const rateKey = `${auth.user.id}:${getClientIp(request)}`;
    const rate = mutationRateLimiter.check(rateKey);
    if (!rate.allowed) {
      return errorResponse(
        429,
        "RATE_LIMITED",
        "Too many VM requests. Please wait before trying again.",
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

    const parsed = vmActionRequestSchema.parse(rawBody);
    const result = await submitVmAction({
      userId: auth.user.id,
      action,
      idempotencyKey: parsed.idempotencyKey,
      requestId,
    });

    return NextResponse.json(
      {
        data: {
          operation: result.operation,
          idempotentReplay: result.idempotentReplay,
        },
      },
      { status: result.idempotentReplay ? 200 : 202 },
    );
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}

