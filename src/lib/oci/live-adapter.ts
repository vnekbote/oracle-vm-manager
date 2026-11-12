import "server-only";
import { Region, SimpleAuthenticationDetailsProvider } from "oci-common";
import { ComputeClient } from "oci-core";
import type { OciLiveConfig } from "@/lib/config/env";
import {
  InvalidStateTransitionError,
  ProviderIntegrationError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  type ProviderActionResult,
  type VmAction,
  type VmAdapter,
  type VmLifecycleState,
  type VmStatus,
} from "./adapter";

export interface OciComputeClientLike {
  getInstance(request: {
    instanceId: string;
  }): Promise<{
    instance: { lifecycleState?: string };
    opcRequestId?: string;
  }>;
  instanceAction(request: {
    instanceId: string;
    action: string;
  }): Promise<{
    instance?: { lifecycleState?: string };
    opcRequestId?: string;
  }>;
}

const VALID_STATES = new Set<VmLifecycleState>([
  "RUNNING",
  "STOPPED",
  "STARTING",
  "STOPPING",
  "TERMINATING",
  "TERMINATED",
  "UNKNOWN",
]);

function mapLifecycleState(raw: string | undefined): VmLifecycleState {
  if (!raw) return "UNKNOWN";
  const upper = raw.toUpperCase() as VmLifecycleState;
  return VALID_STATES.has(upper) ? upper : "UNKNOWN";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ProviderTimeoutError("OCI request timed out.")),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mapOciError(err: unknown): never {
  if (
    err instanceof ProviderTimeoutError ||
    err instanceof ProviderUnavailableError ||
    err instanceof ProviderIntegrationError ||
    err instanceof InvalidStateTransitionError
  ) {
    throw err;
  }

  const statusCode =
    typeof err === "object" && err !== null && "statusCode" in err
      ? Number((err as { statusCode: unknown }).statusCode)
      : undefined;
  const serviceCode =
    typeof err === "object" && err !== null && "serviceCode" in err
      ? String((err as { serviceCode: unknown }).serviceCode)
      : undefined;
  const message =
    err instanceof Error ? err.message : "OCI Compute request failed.";

  if (
    statusCode === 408 ||
    statusCode === 504 ||
    /ETIMEDOUT|ESOCKETTIMEDOUT|timeout/i.test(message)
  ) {
    throw new ProviderTimeoutError("OCI request timed out.");
  }

  if (
    statusCode === 503 ||
    /ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN|fetch failed/i.test(message)
  ) {
    throw new ProviderUnavailableError("Unable to reach OCI Compute API.");
  }

  if (statusCode === 409 || serviceCode === "IncorrectState") {
    throw new InvalidStateTransitionError(
      "OCI rejected the action due to the instance's current lifecycle state.",
    );
  }

  throw new ProviderIntegrationError(
    statusCode
      ? `OCI Compute API error (HTTP ${statusCode}${serviceCode ? `: ${serviceCode}` : ""}).`
      : "OCI Compute API integration error.",
  );
}

/**
 * Live OCI Compute adapter for Oracle Cloud Phoenix (us-phoenix-1) or configured region.
 * Uses server-side IAM API signing key and fixed instance OCID from configuration.
 * Never returns public IP addresses and never falls back to forceful STOP.
 */
export class LiveOciAdapter implements VmAdapter {
  private readonly client: OciComputeClientLike;
  private readonly instanceOcid: string;
  private readonly region: string;

  constructor(
    config: OciLiveConfig,
    injectedClient?: OciComputeClientLike,
  ) {
    this.instanceOcid = config.instanceOcid;
    this.region = config.region;

    if (injectedClient) {
      this.client = injectedClient;
    } else {
      const provider = new SimpleAuthenticationDetailsProvider(
        config.tenancyOcid,
        config.userOcid,
        config.fingerprint,
        config.privateKey,
        null,
        Region.fromRegionId(config.region),
      );
      this.client = new ComputeClient({
        authenticationDetailsProvider: provider,
      });
    }
  }

  async getInstanceStatus(): Promise<VmStatus> {
    try {
      const res = await withTimeout(
        this.client.getInstance({ instanceId: this.instanceOcid }),
        12_000,
      );
      return {
        lifecycleState: mapLifecycleState(res.instance?.lifecycleState),
        checkedAt: new Date().toISOString(),
        source: "OCI",
        region: this.region,
      };
    } catch (err) {
      mapOciError(err);
    }
  }

  private async submitAction(action: VmAction): Promise<ProviderActionResult> {
    try {
      const res = await withTimeout(
        this.client.instanceAction({
          instanceId: this.instanceOcid,
          action,
        }),
        12_000,
      );
      return {
        providerRequestId: res.opcRequestId ?? null,
      };
    } catch (err) {
      mapOciError(err);
    }
  }

  async startInstance(): Promise<ProviderActionResult> {
    return this.submitAction("START");
  }

  async stopInstanceGracefully(): Promise<ProviderActionResult> {
    return this.submitAction("SOFTSTOP");
  }

  async forceStopInstance(): Promise<ProviderActionResult> {
    return this.submitAction("STOP");
  }

  async restartInstanceGracefully(): Promise<ProviderActionResult> {
    return this.submitAction("SOFTRESET");
  }
}

