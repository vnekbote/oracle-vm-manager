import "server-only";
import { getAppConfig } from "@/lib/config/env";
import { MockOciAdapter } from "./mock-adapter";
import { LiveOciAdapter } from "./live-adapter";
import type { VmAdapter } from "./adapter";

const globalForAdapter = globalThis as unknown as {
  __mockOciAdapter?: MockOciAdapter;
};

export function getMockAdapterInstance(): MockOciAdapter {
  if (!globalForAdapter.__mockOciAdapter) {
    globalForAdapter.__mockOciAdapter = new MockOciAdapter({
      initialState: "RUNNING",
      transitionDelayMs: 1200,
      region: process.env.OCI_REGION ?? "us-phoenix-1",
    });
  }
  return globalForAdapter.__mockOciAdapter;
}

export function getVmAdapter(): VmAdapter {
  const cfg = getAppConfig();
  if (cfg.vmAdapterMode === "live") {
    if (!cfg.ociLive) {
      throw new Error("Live OCI configuration is missing.");
    }
    return new LiveOciAdapter(cfg.ociLive);
  }
  return getMockAdapterInstance();
}
