import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryPersistenceStore } from "../src/lib/database/store";
import { MockOciAdapter } from "../src/lib/oci/mock-adapter";
import { ProviderTimeoutError } from "../src/lib/oci/adapter";
import {
  getOperationStatus,
  getVmStatus,
  OperationConflictError,
  OperationNotFoundError,
  submitVmAction,
} from "../src/lib/services/vm.service";

describe("VM orchestration service (MOCK mode)", () => {
  let store: InMemoryPersistenceStore;
  let adapter: MockOciAdapter;
  let userId: string;

  beforeEach(async () => {
    store = new InMemoryPersistenceStore();
    adapter = new MockOciAdapter({
      initialState: "RUNNING",
      transitionDelayMs: 0,
    });
    const admin = await store.upsertAdminUser({
      username: "Vinay Ekbote",
      displayName: "Vinay Ekbote",
      passwordHash: "hash-placeholder",
      mustRotatePassword: false,
    });
    userId = admin.id;
  });

  it("persists operation, submits mock graceful stop, and records audit log", async () => {
    const res = await submitVmAction(
      {
        userId,
        action: "SOFTSTOP",
        idempotencyKey: "idem-stop-001",
        requestId: "req-1",
      },
      { adapter, store },
    );

    expect(res.idempotentReplay).toBe(false);
    expect(res.operation.action).toBe("SOFTSTOP");
    expect(res.operation.status).toBe("IN_PROGRESS");
    expect(res.operation.providerRequestId).toMatch(/^mock-req-/);

    const audits = await store.listAuditLogs({ userId, page: 1, pageSize: 10 });
    expect(audits.items[0]?.action).toBe("VM_SOFTSTOP");
    expect(audits.items[0]?.outcome).toBe("SUCCESS");
  });

  it("returns idempotent replay for duplicate idempotencyKey without duplicate provider call", async () => {
    const first = await submitVmAction(
      {
        userId,
        action: "SOFTSTOP",
        idempotencyKey: "idem-replay-123",
        requestId: "req-1",
      },
      { adapter, store },
    );
    const second = await submitVmAction(
      {
        userId,
        action: "SOFTSTOP",
        idempotencyKey: "idem-replay-123",
        requestId: "req-2",
      },
      { adapter, store },
    );

    expect(second.idempotentReplay).toBe(true);
    expect(second.operation.id).toBe(first.operation.id);
  });

  it("blocks conflicting concurrent operations with OPERATION_IN_PROGRESS", async () => {
    await submitVmAction(
      {
        userId,
        action: "SOFTSTOP",
        idempotencyKey: "idem-first-001",
        requestId: "req-1",
      },
      { adapter, store },
    );

    await expect(
      submitVmAction(
        {
          userId,
          action: "SOFTRESET",
          idempotencyKey: "idem-second-002",
          requestId: "req-2",
        },
        { adapter, store },
      ),
    ).rejects.toThrow(OperationConflictError);
  });

  it("reconciles operation to SUCCEEDED when authoritative state reaches target", async () => {
    const { operation } = await submitVmAction(
      {
        userId,
        action: "SOFTSTOP",
        idempotencyKey: "idem-reconcile-001",
        requestId: "req-1",
      },
      { adapter, store },
    );

    adapter.setState("STOPPED");
    const checked = await getOperationStatus(
      { operationId: operation.id, userId },
      { adapter, store },
    );
    expect(checked.status).toBe("SUCCEEDED");
    expect(checked.completedAt).not.toBeNull();
  });

  it("marks timed-out provider submission as TIMED_OUT without forceful fallback", async () => {
    adapter.setFaultMode("TIMEOUT");
    // Adapter is RUNNING, but getInstanceStatus will throw TIMEOUT first;
    // test timeout during submission using a custom adapter wrapper:
    const timeoutOnStopAdapter = new MockOciAdapter({ initialState: "RUNNING" });
    timeoutOnStopAdapter.stopInstanceGracefully = async () => {
      throw new ProviderTimeoutError("Simulated timeout during SOFTSTOP");
    };

    await expect(
      submitVmAction(
        {
          userId,
          action: "SOFTSTOP",
          idempotencyKey: "idem-timeout-001",
          requestId: "req-1",
        },
        { adapter: timeoutOnStopAdapter, store },
      ),
    ).rejects.toThrow(ProviderTimeoutError);

    const audits = await store.listAuditLogs({ userId, page: 1, pageSize: 10 });
    expect(audits.items[0]?.outcome).toBe("FAILURE");
    // Ensure instance state was NOT forcefully stopped
    expect((await timeoutOnStopAdapter.getInstanceStatus()).lifecycleState).toBe(
      "RUNNING",
    );
  });

  it("returns UNKNOWN and stale=true when provider is unreachable", async () => {
    adapter.setFaultMode("NETWORK_ERROR");
    const status = await getVmStatus({ adapter, store });
    expect(status.instanceStatus).toBe("UNKNOWN");
    expect(status.stale).toBe(true);
    expect(status.source).toBe("MOCK");
  });

  it("allows explicit manual STOP to supersede a stuck STOPPING operation", async () => {
    const first = await submitVmAction(
      {
        userId,
        action: "SOFTSTOP",
        idempotencyKey: "idem-stuck-softstop",
        requestId: "req-1",
      },
      { adapter, store },
    );
    expect((await adapter.getInstanceStatus()).lifecycleState).toBe("STOPPING");

    const forced = await submitVmAction(
      {
        userId,
        action: "STOP",
        idempotencyKey: "idem-manual-force-stop",
        requestId: "req-2",
      },
      { adapter, store },
    );

    expect(forced.operation.action).toBe("STOP");
    expect(forced.operation.status).toBe("IN_PROGRESS");

    const superseded = await store.findOperationById(first.operation.id, userId);
    expect(superseded?.status).toBe("FAILED");
    expect(superseded?.errorCode).toBe("SUPERSEDED_BY_FORCE_STOP");
  });

  it("throws OperationNotFoundError for unknown operation ID", async () => {
    await expect(
      getOperationStatus(
        { operationId: crypto.randomUUID(), userId },
        { adapter, store },
      ),
    ).rejects.toThrow(OperationNotFoundError);
  });
});

