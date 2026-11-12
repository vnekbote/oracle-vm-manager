import { describe, it, expect, vi, afterEach } from "vitest";
import { MockOciAdapter } from "../src/lib/oci/mock-adapter";
import {
  InvalidStateTransitionError,
  ProviderIntegrationError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "../src/lib/oci/adapter";

describe("MockOciAdapter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns mock status in us-phoenix-1 without OCI access", async () => {
    const adapter = new MockOciAdapter({ region: "us-phoenix-1" });
    const status = await adapter.getInstanceStatus();
    expect(status.source).toBe("MOCK");
    expect(status.lifecycleState).toBe("RUNNING");
    expect(status.region).toBe("us-phoenix-1");
  });

  it("transitions RUNNING -> STOPPING -> STOPPED on graceful stop", async () => {
    vi.useFakeTimers();
    const adapter = new MockOciAdapter({
      initialState: "RUNNING",
      transitionDelayMs: 500,
    });

    const result = await adapter.stopInstanceGracefully();
    expect(result.providerRequestId).toMatch(/^mock-req-/);
    expect((await adapter.getInstanceStatus()).lifecycleState).toBe("STOPPING");

    await vi.advanceTimersByTimeAsync(500);
    expect((await adapter.getInstanceStatus()).lifecycleState).toBe("STOPPED");
  });

  it("transitions STOPPED -> STARTING -> RUNNING on start", async () => {
    vi.useFakeTimers();
    const adapter = new MockOciAdapter({
      initialState: "STOPPED",
      transitionDelayMs: 500,
    });

    await adapter.startInstance();
    expect((await adapter.getInstanceStatus()).lifecycleState).toBe("STARTING");

    await vi.advanceTimersByTimeAsync(500);
    expect((await adapter.getInstanceStatus()).lifecycleState).toBe("RUNNING");
  });

  it("transitions RUNNING -> STOPPING -> STARTING -> RUNNING on graceful restart", async () => {
    vi.useFakeTimers();
    const adapter = new MockOciAdapter({
      initialState: "RUNNING",
      transitionDelayMs: 400,
    });

    await adapter.restartInstanceGracefully();
    expect((await adapter.getInstanceStatus()).lifecycleState).toBe("STOPPING");

    await vi.advanceTimersByTimeAsync(200);
    expect((await adapter.getInstanceStatus()).lifecycleState).toBe("STARTING");

    await vi.advanceTimersByTimeAsync(200);
    expect((await adapter.getInstanceStatus()).lifecycleState).toBe("RUNNING");
  });

  it("rejects invalid state transitions", async () => {
    const adapter = new MockOciAdapter({ initialState: "RUNNING" });
    await expect(adapter.startInstance()).rejects.toThrow(
      InvalidStateTransitionError,
    );

    adapter.setState("STOPPED");
    await expect(adapter.stopInstanceGracefully()).rejects.toThrow(
      InvalidStateTransitionError,
    );
  });

  it("simulates timeout, network error, and provider error fault modes", async () => {
    const adapter = new MockOciAdapter({ initialState: "RUNNING" });

    adapter.setFaultMode("TIMEOUT");
    await expect(adapter.stopInstanceGracefully()).rejects.toThrow(
      ProviderTimeoutError,
    );

    adapter.setFaultMode("NETWORK_ERROR");
    await expect(adapter.getInstanceStatus()).rejects.toThrow(
      ProviderUnavailableError,
    );

    adapter.setFaultMode("PROVIDER_ERROR");
    await expect(adapter.restartInstanceGracefully()).rejects.toThrow(
      ProviderIntegrationError,
    );
  });
});
