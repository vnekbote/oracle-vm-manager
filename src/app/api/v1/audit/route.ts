import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { getStore } from "@/lib/database/store";
import { handleRouteError } from "@/lib/http/responses";
import { auditQuerySchema } from "@/lib/validators/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireAdminSession(request, {
      allowPasswordRotationPending: true,
    });

    const url = new URL(request.url);
    const parsed = auditQuerySchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    const store = getStore();
    const result = await store.listAuditLogs({
      userId: auth.user.id,
      page: parsed.page,
      pageSize: parsed.pageSize,
    });

    return NextResponse.json({
      data: {
        items: result.items,
        page: parsed.page,
        pageSize: parsed.pageSize,
        total: result.total,
      },
    });
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}
