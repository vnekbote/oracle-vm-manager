import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { handleRouteError } from "@/lib/http/responses";
import { getVmStatus } from "@/lib/services/vm.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireAdminSession(request, { allowPasswordRotationPending: true });
    const status = await getVmStatus();
    return NextResponse.json({ data: status });
  } catch (err) {
    return handleRouteError(err, requestId);
  }
}
