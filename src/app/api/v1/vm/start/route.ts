import { handleVmActionRequest } from "@/lib/http/vm-action-handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleVmActionRequest(request, "START");
}
