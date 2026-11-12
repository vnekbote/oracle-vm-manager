import "server-only";
import { getAppConfig } from "@/lib/config/env";
import { getStore, type PersistenceStore, type VmInstanceRecord } from "@/lib/database/store";
import { getVmAdapter } from "@/lib/oci";
import {
  InvalidStateTransitionError,
  ProviderIntegrationError,
  ProviderTimeoutError,
  ProviderUnavailableError,
  type VmAdapter,
} from "@/lib/oci/adapter";
import { logStructured } from "@/lib/security/redact";
import type {
  OperationDto,
  VmAction,
  VmLifecycleState,
  VmStatusDto,
} from "@/types/vm";

const DEFAULT_OPERATION_TIMEOUT_MS = 300_000; // 5 minutes for graceful OCI transitions

export class OperationConflictError extends Error {
  constructor(
    public readonly code: "OPERATION_IN_PROGRESS" | "INVALID_STATE_TRANSITION",
    message: string,
  ) {
    super(message);
    this.name = "OperationConflictError";
  }
}

export class OperationNotFoundError extends Error {
  constructor(message = "Operation not found.") {
    super(message);
    this.name = "OperationNotFoundError";
  }
}

export interface VmServiceDeps {
  adapter?: VmAdapter;
  store?: PersistenceStore;
  operationTimeoutMs?: number;
}

function isTargetStateReached(
  action: VmAction,
  lifecycleState: VmLifecycleState,
  elapsedMs: number,
): boolean {
  switch (action) {
    case "START":
      return lifecycleState === "RUNNING";
    case "SOFTSTOP":
    case "STOP":
      return lifecycleState === "STOPPED";
    case "SOFTRESET": {
      // In live OCI, SOFTRESET can remain RUNNING briefly before entering STOPPING -> STARTING -> RUNNING.
      const minResetGraceMs = getAppConfig().vmAdapterMode === "live" ? 5_000 : 100;
      return lifecycleState === "RUNNING" && elapsedMs >= minResetGraceMs;
    }
  }
}

function isActionAllowedFromState(
  action: VmAction,
  lifecycleState: VmLifecycleState,
): boolean {
  switch (action) {
    case "START":
      return lifecycleState === "STOPPED";
    case "SOFTSTOP":
    case "SOFTRESET":
      return lifecycleState === "RUNNING";
    case "STOP":
      return lifecycleState === "RUNNING" || lifecycleState === "STOPPING";
  }
}

const vmRecordCache = new Map<string, VmInstanceRecord>();

async function ensureVmRecord(store: PersistenceStore): Promise<VmInstanceRecord> {
  const cfg = getAppConfig();
  // Only cache when using the default singleton/DB store (not custom test stores)
  const cached = vmRecordCache.get(cfg.ociInstanceOcid);
  if (cached && store.constructor.name === "DrizzlePersistenceStore") {
    return cached;
  }
  const record = await store.ensureConfiguredVmInstance({
    displayName: cfg.ociInstanceDisplayName,
    instanceOcid: cfg.ociInstanceOcid,
    region: cfg.ociRegion,
    compartmentOcid: cfg.ociCompartmentOcid,
    os: "Oracle Linux",
  });
  if (store.constructor.name === "DrizzlePersistenceStore") {
    vmRecordCache.set(cfg.ociInstanceOcid, record);
  }
  return record;
}

async function reconcileActiveOperations(
  store: PersistenceStore,
  vmId: string,
  authoritativeState: VmLifecycleState,
  timeoutMs: number,
): Promise<OperationDto | null> {
  const activeOps = await store.findActiveOperationsForVm(vmId);
  if (activeOps.length === 0) return null;

  const now = Date.now();
  let currentActive: OperationDto | null = null;

  for (const op of activeOps) {
    const requestedAtMs = new Date(op.requestedAt).getTime();
    const elapsedMs = Math.max(0, now - requestedAtMs);

    if (
      authoritativeState !== "UNKNOWN" &&
      isTargetStateReached(op.action, authoritativeState, elapsedMs)
    ) {
      await store.updateOperation(op.id, {
        status: "SUCCEEDED",
        completedAt: new Date(now),
      });
      continue;
    }

    if (elapsedMs > timeoutMs) {
      await store.updateOperation(op.id, {
        status: "TIMED_OUT",
        errorCode: "RECONCILIATION_TIMEOUT",
        completedAt: new Date(now),
      });
      continue;
    }

    if (!currentActive) {
      currentActive = op;
    }
  }

  return currentActive;
}

export async function getVmStatus(deps: VmServiceDeps = {}): Promise<VmStatusDto> {
  const cfg = getAppConfig();
  const adapter = deps.adapter ?? getVmAdapter();
  const store = deps.store ?? getStore();
  const timeoutMs = deps.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
  const vm = await ensureVmRecord(store);

  try {
    const status = await adapter.getInstanceStatus();
    const activeOperation = await reconcileActiveOperations(
      store,
      vm.id,
      status.lifecycleState,
      timeoutMs,
    );

    return {
      instanceStatus: status.lifecycleState,
      source: status.source,
      checkedAt: status.checkedAt,
      stale: false,
      region: status.region || cfg.ociRegion,
      os: vm.os,
      displayName: vm.displayName,
      activeOperation,
    };
  } catch (err) {
    logStructured("warn", "vm.status.provider_error", {
      error: err instanceof Error ? err.message : "unknown",
    });

    const activeOps = await store.findActiveOperationsForVm(vm.id);
    return {
      instanceStatus: "UNKNOWN",
      source: cfg.vmAdapterMode === "live" ? "OCI" : "MOCK",
      checkedAt: new Date().toISOString(),
      stale: true,
      region: cfg.ociRegion,
      os: vm.os,
      displayName: vm.displayName,
      activeOperation: activeOps[0] ?? null,
    };
  }
}

export async function submitVmAction(
  input: {
    userId: string;
    action: VmAction;
    idempotencyKey: string;
    requestId: string;
  },
  deps: VmServiceDeps = {},
): Promise<{ operation: OperationDto; idempotentReplay: boolean }> {
  const adapter = deps.adapter ?? getVmAdapter();
  const store = deps.store ?? getStore();
  const timeoutMs = deps.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;

  // 1. Idempotency check
  const existingByKey = await store.findOperationByIdempotencyKey(
    input.idempotencyKey,
    input.userId,
  );
  if (existingByKey) {
    await store.createAuditLog({
      userId: input.userId,
      action: `VM_${input.action}_REPLAY`,
      outcome: "SUCCESS",
      requestId: input.requestId,
      metadata: {
        operationId: existingByKey.id,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return { operation: existingByKey, idempotentReplay: true };
  }

  const vm = await ensureVmRecord(store);

  // 2. Check authoritative state & reconcile any stale operations first
  const authoritative = await adapter.getInstanceStatus();
  const activeOp = await reconcileActiveOperations(
    store,
    vm.id,
    authoritative.lifecycleState,
    timeoutMs,
  );

  // 3. Per-instance operation lock (allow explicit manual STOP to supersede a stuck STOPPING op)
  if (activeOp) {
    const canSupersedeStuckStopping =
      input.action === "STOP" &&
      authoritative.lifecycleState === "STOPPING" &&
      (activeOp.action === "SOFTSTOP" || activeOp.action === "SOFTRESET");

    if (canSupersedeStuckStopping) {
      await store.updateOperation(activeOp.id, {
        status: "FAILED",
        errorCode: "SUPERSEDED_BY_FORCE_STOP",
        completedAt: new Date(),
      });
    } else {
      await store.createAuditLog({
        userId: input.userId,
        action: `VM_${input.action}`,
        outcome: "CONFLICT",
        requestId: input.requestId,
        metadata: {
          reason: "OPERATION_IN_PROGRESS",
          blockingOperationId: activeOp.id,
        },
      });
      throw new OperationConflictError(
        "OPERATION_IN_PROGRESS",
        "A VM operation is already in progress.",
      );
    }
  }

  // 4. Validate state transition against authoritative state
  if (!isActionAllowedFromState(input.action, authoritative.lifecycleState)) {
    await store.createAuditLog({
      userId: input.userId,
      action: `VM_${input.action}`,
      outcome: "CONFLICT",
      requestId: input.requestId,
      metadata: {
        reason: "INVALID_STATE_TRANSITION",
        currentState: authoritative.lifecycleState,
      },
    });
    throw new OperationConflictError(
      "INVALID_STATE_TRANSITION",
      `Cannot perform ${input.action} while instance is in ${authoritative.lifecycleState} state.`,
    );
  }

  // 5. Persist operation BEFORE submitting to provider
  const createdOp = await store.createOperation({
    userId: input.userId,
    vmId: vm.id,
    action: input.action,
    status: "SUBMITTED",
    idempotencyKey: input.idempotencyKey,
  });

  // 6. Submit to adapter (no forceful fallback on timeout)
  try {
    let result: { providerRequestId: string | null };
    switch (input.action) {
      case "START":
        result = await adapter.startInstance();
        break;
      case "SOFTSTOP":
        result = await adapter.stopInstanceGracefully();
        break;
      case "STOP":
        result = await adapter.forceStopInstance();
        break;
      case "SOFTRESET":
        result = await adapter.restartInstanceGracefully();
        break;
    }

    const updated =
      (await store.updateOperation(createdOp.id, {
        status: "IN_PROGRESS",
        providerRequestId: result.providerRequestId,
      })) ?? createdOp;

    await store.createAuditLog({
      userId: input.userId,
      action: `VM_${input.action}`,
      outcome: "SUCCESS",
      requestId: input.requestId,
      metadata: {
        operationId: updated.id,
        providerRequestId: updated.providerRequestId,
        mode: getAppConfig().vmAdapterMode.toUpperCase(),
      },
    });

    return { operation: updated, idempotentReplay: false };
  } catch (err) {
    if (err instanceof ProviderTimeoutError) {
      await store.updateOperation(createdOp.id, {
        status: "TIMED_OUT",
        errorCode: err.code,
        completedAt: new Date(),
      });
    } else if (err instanceof InvalidStateTransitionError) {
      await store.updateOperation(createdOp.id, {
        status: "FAILED",
        errorCode: err.code,
        completedAt: new Date(),
      });
    } else if (
      err instanceof ProviderUnavailableError ||
      err instanceof ProviderIntegrationError
    ) {
      await store.updateOperation(createdOp.id, {
        status: "FAILED",
        errorCode: err.code,
        completedAt: new Date(),
      });
    } else {
      await store.updateOperation(createdOp.id, {
        status: "FAILED",
        errorCode: "INTERNAL_ERROR",
        completedAt: new Date(),
      });
    }

    await store.createAuditLog({
      userId: input.userId,
      action: `VM_${input.action}`,
      outcome: "FAILURE",
      requestId: input.requestId,
      metadata: {
        operationId: createdOp.id,
        errorCode:
          err instanceof Error && "code" in err
            ? String((err as { code: unknown }).code)
            : "UNKNOWN",
      },
    });

    throw err;
  }
}

export async function getOperationStatus(
  input: { operationId: string; userId: string },
  deps: VmServiceDeps = {},
): Promise<OperationDto> {
  const adapter = deps.adapter ?? getVmAdapter();
  const store = deps.store ?? getStore();
  const timeoutMs = deps.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;

  const op = await store.findOperationById(input.operationId, input.userId);
  if (!op) {
    throw new OperationNotFoundError();
  }

  if (op.status === "SUBMITTED" || op.status === "IN_PROGRESS") {
    try {
      const authoritative = await adapter.getInstanceStatus();
      const vm = await ensureVmRecord(store);
      await reconcileActiveOperations(
        store,
        vm.id,
        authoritative.lifecycleState,
        timeoutMs,
      );
      const refreshed = await store.findOperationById(
        input.operationId,
        input.userId,
      );
      if (refreshed) return refreshed;
    } catch {
      // Return persisted state if provider is temporarily unreachable
    }
  }

  return op;
}
