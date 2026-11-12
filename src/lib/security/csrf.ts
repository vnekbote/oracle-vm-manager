import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getAppConfig } from "@/lib/config/env";

export const CSRF_HEADER_NAME = "x-csrf-token";

export function generateCsrfToken(sessionId: string): string {
  const { authSecret } = getAppConfig();
  return createHmac("sha256", authSecret)
    .update(`csrf:${sessionId}`)
    .digest("hex");
}

export function verifyCsrfToken(sessionId: string, providedToken: string | null): boolean {
  if (!providedToken) return false;
  const expected = generateCsrfToken(sessionId);
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(providedToken, "utf8");
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, providedBuf);
}

export function verifySameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const { appUrl } = getAppConfig();

  if (!origin) {
    // Allow same-origin non-browser/server-to-server requests that lack Origin
    // only if Sec-Fetch-Site is not cross-site.
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      return false;
    }
    return true;
  }

  try {
    const originUrl = new URL(origin);
    const configuredUrl = new URL(appUrl);
    if (originUrl.origin === configuredUrl.origin) {
      return true;
    }
    if (host && originUrl.host === host) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

