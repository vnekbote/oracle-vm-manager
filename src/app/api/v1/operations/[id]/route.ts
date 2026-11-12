import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { handleRouteError } from "@/lib/http/responses";
import { getOperationStatus } from "@/lib/services/vm.service";
import { operationIdParamSchema } from "@/lib/validators/schemas";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireAdminSession(request, {
      allowPasswordRotationPending: true,
    });
    const rawParams = await context.params;
    const { id } = operationIdParamSchema.parse(rawParams);
    const operation = await getOperationStatus({
      operationId: id,
      userId: auth.user.id,
    });
    return NextResponse.json({ data: { operation } });
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}
