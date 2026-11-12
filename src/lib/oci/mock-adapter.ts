import {
  InvalidStateTransitionError,
  ProviderIntegrationError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  type ProviderActionResult,
  type VmAdapter,
  type VmLifecycleState,
  type VmStatus,
} from "./adapter";

export type MockFaultMode =
  | "NONE"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "PROVIDER_ERROR";

export interface MockAdapterOptions {
  initialState?: VmLifecycleState;
  transitionDelayMs?: number;
  region?: string;
}

/**
 * Safe local adapter. It never imports an OCI SDK or makes network requests.
 * Simulates transitional OCI lifecycle states, timeouts, and network failures.
 */
export class MockOciAdapter implements VmAdapter {
  private state: VmLifecycleState;
  private transitionDelayMs: number;
  private readonly region: string;
  private faultMode: MockFaultMode = "NONE";
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private secondaryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: MockAdapterOptions = {}) {
    this.state = options.initialState ?? "RUNNING";
    this.transitionDelayMs = options.transitionDelayMs ?? 1500;
    this.region = options.region ?? "us-phoenix-1";
  }

  setFaultMode(mode: MockFaultMode): void {
    this.faultMode = mode;
  }

  getFaultMode(): MockFaultMode {
    return this.faultMode;
  }

  setState(state: VmLifecycleState): void {
    this.clearTimers();
    this.state = state;
  }

  setTransitionDelayMs(delayMs: number): void {
    this.transitionDelayMs = delayMs;
  }

  reset(initialState: VmLifecycleState = "RUNNING"): void {
    this.clearTimers();
    this.faultMode = "NONE";
    this.state = initialState;
  }

  private clearTimers(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    if (this.secondaryTimer) {
      clearTimeout(this.secondaryTimer);
      this.secondaryTimer = null;
    }
  }

  private assertNoFault(): void {
    if (this.faultMode === "TIMEOUT") {
      throw new ProviderTimeoutError(
        "Simulated provider timeout (MOCK mode). No forceful fallback executed.",
      );
    }
    if (this.faultMode === "NETWORK_ERROR") {
      throw new ProviderUnavailableError(
        "Simulated network failure reaching provider (MOCK mode).",
      );
    }
    if (this.faultMode === "PROVIDER_ERROR") {
      throw new ProviderIntegrationError(
        "Simulated provider 502 integration error (MOCK mode).",
      );
    }
  }

  async getInstanceStatus(): Promise<VmStatus> {
    this.assertNoFault();
    return {
      lifecycleState: this.state,
      checkedAt: new Date().toISOString(),
      source: "MOCK",
      region: this.region,
    };
  }

  async startInstance(): Promise<ProviderActionResult> {
    this.assertNoFault();
    if (this.state !== "STOPPED") {
      throw new InvalidStateTransitionError(
        `Cannot START instance from ${this.state} state; instance must be STOPPED.`,
      );
    }

    this.clearTimers();
    this.state = "STARTING";
    if (this.transitionDelayMs > 0) {
      this.pendingTimer = setTimeout(() => {
        this.state = "RUNNING";
        this.pendingTimer = null;
      }, this.transitionDelayMs);
    }

    return { providerRequestId: `mock-req-${crypto.randomUUID()}` };
  }

  async stopInstanceGracefully(): Promise<ProviderActionResult> {
    this.assertNoFault();
    if (this.state !== "RUNNING") {
      throw new InvalidStateTransitionError(
        `Cannot SOFTSTOP instance from ${this.state} state; instance must be RUNNING.`,
      );
    }

    this.clearTimers();
    this.state = "STOPPING";
    if (this.transitionDelayMs > 0) {
      this.pendingTimer = setTimeout(() => {
        this.state = "STOPPED";
        this.pendingTimer = null;
      }, this.transitionDelayMs);
    }

    return { providerRequestId: `mock-req-${crypto.randomUUID()}` };
  }

  async forceStopInstance(): Promise<ProviderActionResult> {
    this.assertNoFault();
    if (this.state !== "RUNNING" && this.state !== "STOPPING") {
      throw new InvalidStateTransitionError(
        `Cannot STOP instance from ${this.state} state; instance must be RUNNING or STOPPING.`,
      );
    }

    this.clearTimers();
    this.state = "STOPPING";
    if (this.transitionDelayMs > 0) {
      this.pendingTimer = setTimeout(() => {
        this.state = "STOPPED";
        this.pendingTimer = null;
      }, Math.min(200, this.transitionDelayMs));
    }

    return { providerRequestId: `mock-req-${crypto.randomUUID()}` };
  }

  async restartInstanceGracefully(): Promise<ProviderActionResult> {
    this.assertNoFault();
    if (this.state !== "RUNNING") {
      throw new InvalidStateTransitionError(
        `Cannot SOFTRESET instance from ${this.state} state; instance must be RUNNING.`,
      );
    }

    this.clearTimers();
    this.state = "STOPPING";
    if (this.transitionDelayMs > 0) {
      const half = Math.max(50, Math.floor(this.transitionDelayMs / 2));
      this.pendingTimer = setTimeout(() => {
        this.state = "STARTING";
        this.pendingTimer = null;
        this.secondaryTimer = setTimeout(() => {
          this.state = "RUNNING";
          this.secondaryTimer = null;
        }, half);
      }, half);
    }

    return { providerRequestId: `mock-req-${crypto.randomUUID()}` };
  }
}
