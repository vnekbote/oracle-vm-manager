import { describe, it, expect, vi } from "vitest";
import {
  LiveOciAdapter,
  type OciComputeClientLike,
} from "../src/lib/oci/live-adapter";
import {
  InvalidStateTransitionError,
  ProviderIntegrationError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from "../src/lib/oci/adapter";
import type { OciLiveConfig } from "../src/lib/config/env";

const TEST_CONFIG: OciLiveConfig = {
  region: "us-phoenix-1",
  tenancyOcid: "ocid1.tenancy.oc1..test",
  userOcid: "ocid1.user.oc1..test",
  fingerprint: "aa:bb:cc:dd",
  privateKey: "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----",
  compartmentOcid: "ocid1.compartment.oc1..test",
  instanceOcid: "ocid1.instance.oc1.phx.testinstance",
};

describe("LiveOciAdapter (unit tests with mocked ComputeClient)", () => {
  it("maps getInstance lifecycleState and returns source OCI", async () => {
    const mockClient: OciComputeClientLike = {
      getInstance: vi.fn().mockResolvedValue({
        instance: { lifecycleState: "RUNNING" },
        opcRequestId: "opc-get-1",
      }),
      instanceAction: vi.fn(),
    };

    const adapter = new LiveOciAdapter(TEST_CONFIG, mockClient);
    const status = await adapter.getInstanceStatus();

    expect(mockClient.getInstance).toHaveBeenCalledWith({
      instanceId: TEST_CONFIG.instanceOcid,
    });
    expect(status.lifecycleState).toBe("RUNNING");
    expect(status.source).toBe("OCI");
    expect(status.region).toBe("us-phoenix-1");
  });

  it("maps START, SOFTSTOP, STOP, and SOFTRESET actions and returns opcRequestId", async () => {
    const instanceAction = vi
      .fn()
      .mockResolvedValueOnce({ opcRequestId: "opc-start-1" })
      .mockResolvedValueOnce({ opcRequestId: "opc-stop-1" })
      .mockResolvedValueOnce({ opcRequestId: "opc-force-stop-1" })
      .mockResolvedValueOnce({ opcRequestId: "opc-reset-1" });

    const mockClient: OciComputeClientLike = {
      getInstance: vi.fn(),
      instanceAction,
    };

    const adapter = new LiveOciAdapter(TEST_CONFIG, mockClient);

    expect(await adapter.startInstance()).toEqual({
      providerRequestId: "opc-start-1",
    });
    expect(await adapter.stopInstanceGracefully()).toEqual({
      providerRequestId: "opc-stop-1",
    });
    expect(await adapter.forceStopInstance()).toEqual({
      providerRequestId: "opc-force-stop-1",
    });
    expect(await adapter.restartInstanceGracefully()).toEqual({
      providerRequestId: "opc-reset-1",
    });

    expect(instanceAction).toHaveBeenNthCalledWith(1, {
      instanceId: TEST_CONFIG.instanceOcid,
      action: "START",
    });
    expect(instanceAction).toHaveBeenNthCalledWith(2, {
      instanceId: TEST_CONFIG.instanceOcid,
      action: "SOFTSTOP",
    });
    expect(instanceAction).toHaveBeenNthCalledWith(3, {
      instanceId: TEST_CONFIG.instanceOcid,
      action: "STOP",
    });
    expect(instanceAction).toHaveBeenNthCalledWith(4, {
      instanceId: TEST_CONFIG.instanceOcid,
      action: "SOFTRESET",
    });
  });

  it("maps OCI 409, timeout, network, and 500 errors to typed adapter errors", async () => {
    const getInstance = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 409, serviceCode: "IncorrectState" })
      .mockRejectedValueOnce({ statusCode: 504, message: "Request timeout" })
      .mockRejectedValueOnce(new Error("ENOTFOUND iaas.us-phoenix-1.oraclecloud.com"))
      .mockRejectedValueOnce({ statusCode: 500, serviceCode: "InternalError" });

    const adapter = new LiveOciAdapter(TEST_CONFIG, {
      getInstance,
      instanceAction: vi.fn(),
    });

    await expect(adapter.getInstanceStatus()).rejects.toThrow(
      InvalidStateTransitionError,
    );
    await expect(adapter.getInstanceStatus()).rejects.toThrow(
      ProviderTimeoutError,
    );
    await expect(adapter.getInstanceStatus()).rejects.toThrow(
      ProviderUnavailableError,
    );
    await expect(adapter.getInstanceStatus()).rejects.toThrow(
      ProviderIntegrationError,
    );
  });
});

