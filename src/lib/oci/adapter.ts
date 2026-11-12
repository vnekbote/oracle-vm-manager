import type { AdapterSource, VmLifecycleState } from "@/types/vm";

export type { VmAction, VmLifecycleState } from "@/types/vm";

export interface VmStatus {
  lifecycleState: VmLifecycleState;
  checkedAt: string;
  source: AdapterSource;
  region: string;
}

export interface ProviderActionResult {
  providerRequestId: string | null;
}

export class ProviderTimeoutError extends Error {
  readonly code = "PROVIDER_TIMEOUT";
  constructor(message = "Provider request timed out.") {
    super(message);
    this.name = "ProviderTimeoutError";
  }
}

export class ProviderUnavailableError extends Error {
  readonly code = "PROVIDER_UNAVAILABLE";
  constructor(message = "Provider is unreachable.") {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export class ProviderIntegrationError extends Error {
  readonly code = "PROVIDER_INTEGRATION_ERROR";
  constructor(message = "Provider returned an error.") {
    super(message);
    this.name = "ProviderIntegrationError";
  }
}

export class InvalidStateTransitionError extends Error {
  readonly code = "INVALID_STATE_TRANSITION";
  constructor(message: string) {
    super(message);
    this.name = "InvalidStateTransitionError";
  }
}

/**
 * Provider-independent Compute VM adapter interface.
 * Future live OCI integration (Phase 6, separately approved) will implement
 * this interface for Oracle Cloud Phoenix (us-phoenix-1) using server-side
 * IAM API signing keys and fixed OCIDs:
 *   - startInstance() -> OCI InstanceAction("START")
 *   - stopInstanceGracefully() -> OCI InstanceAction("SOFTSTOP")
 *   - restartInstanceGracefully() -> OCI InstanceAction("SOFTRESET")
 */
export interface VmAdapter {
  getInstanceStatus(): Promise<VmStatus>;
  startInstance(): Promise<ProviderActionResult>;
  stopInstanceGracefully(): Promise<ProviderActionResult>;
  forceStopInstance(): Promise<ProviderActionResult>;
  restartInstanceGracefully(): Promise<ProviderActionResult>;
}
