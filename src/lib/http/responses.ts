import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/session";
import { DatabaseUnavailableError } from "@/lib/database/client";
import {
  InvalidStateTransitionError,
  ProviderIntegrationError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "@/lib/oci/adapter";
import {
  OperationConflictError,
  OperationNotFoundError,
} from "@/lib/services/vm.service";
import { logStructured } from "@/lib/security/redact";

export function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        requestId,
      },
    },
    { status, headers },
  );
}

export function handleRouteError(err: unknown, requestId: string): NextResponse {
  if (err instanceof AuthError) {
    return errorResponse(err.status, err.code, err.message, requestId);
  }
  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    const message = firstIssue
      ? `${firstIssue.path.join(".") || "request"}: ${firstIssue.message}`
      : "Invalid request payload.";
    return errorResponse(400, "INVALID_REQUEST", message, requestId);
  }
  if (err instanceof OperationConflictError) {
    return errorResponse(409, err.code, err.message, requestId);
  }
  if (err instanceof InvalidStateTransitionError) {
    return errorResponse(409, err.code, err.message, requestId);
  }
  if (err instanceof OperationNotFoundError) {
    return errorResponse(404, "OPERATION_NOT_FOUND", err.message, requestId);
  }
  if (err instanceof ProviderTimeoutError) {
    return errorResponse(504, err.code, err.message, requestId);
  }
  if (err instanceof ProviderUnavailableError) {
    return errorResponse(503, err.code, err.message, requestId);
  }
  if (err instanceof ProviderIntegrationError) {
    return errorResponse(502, err.code, err.message, requestId);
  }
  if (err instanceof DatabaseUnavailableError) {
    return errorResponse(503, "DATABASE_UNAVAILABLE", err.message, requestId);
  }

  logStructured("error", "api.unhandled_error", {
    requestId,
    message: err instanceof Error ? err.message : "Unknown error",
  });
  return errorResponse(
    500,
    "INTERNAL_ERROR",
    "An unexpected internal error occurred.",
    requestId,
  );
}

