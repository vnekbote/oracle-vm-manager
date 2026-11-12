"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  HardDrive,
  Loader2,
  LogOut,
  Power,
  RefreshCw,
  RotateCw,
  Server,
  ShieldCheck,
  Square,
  Zap,
} from "lucide-react";
import type {
  AuditLogDto,
  AuthUserDto,
  OperationDto,
  VmStatusDto,
} from "@/types/vm";
import { ConfirmActionDialog } from "./confirm-dialog";
import { PasswordRotationCard } from "./password-rotation-card";

type ActionKind = "start" | "stop" | "force-stop" | "restart";

const ACTION_META: Record<
  ActionKind,
  {
    title: string;
    description: string;
    confirmLabel: string;
    variant: "primary" | "danger" | "secondary";
  }
> = {
  start: {
    title: "Start VM instance?",
    description:
      "This will submit a START operation in MOCK mode. No live Oracle Cloud instance will be modified.",
    confirmLabel: "Confirm Start",
    variant: "primary",
  },
  stop: {
    title: "Gracefully stop VM instance?",
    description:
      "This will submit a graceful SOFTSTOP operation in MOCK mode. No automatic forceful fallback will occur.",
    confirmLabel: "Confirm Graceful Stop",
    variant: "danger",
  },
  "force-stop": {
    title: "Force stop VM instance?",
    description:
      "Force stop powers off the VM immediately without waiting for Oracle Linux to shut down cleanly. Use this only if Graceful stop or restart is stuck in STOPPING.",
    confirmLabel: "Confirm Force Stop",
    variant: "danger",
  },
  restart: {
    title: "Gracefully restart VM instance?",
    description:
      "This will submit a graceful SOFTRESET operation in MOCK mode.",
    confirmLabel: "Confirm Graceful Restart",
    variant: "secondary",
  },
};

const MAX_OPERATION_POLLS = 60;
const MOCK_POLL_INTERVAL_MS = 1000;
const LIVE_POLL_INTERVAL_MS = 3000;

export interface VmDashboardProps {
  initialUser?: AuthUserDto;
  initialCsrfToken?: string;
}

function getStatusBadgeClass(state: string | undefined): string {
  switch (state) {
    case "RUNNING":
      return "status status-running";
    case "STOPPED":
      return "status status-stopped";
    case "STARTING":
    case "STOPPING":
      return "status status-transitional";
    default:
      return "status status-unknown";
  }
}

function getOutcomeBadgeClass(outcome: AuditLogDto["outcome"]): string {
  switch (outcome) {
    case "SUCCESS":
      return "status status-running";
    case "CONFLICT":
      return "status status-stopped";
    case "FAILURE":
    case "DENIED":
      return "status status-unknown";
    default:
      return "status";
  }
}

export function VmDashboard({
  initialUser,
  initialCsrfToken,
}: VmDashboardProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUserDto | null>(initialUser ?? null);
  const [csrfToken, setCsrfToken] = useState<string>(initialCsrfToken ?? "");
  const [status, setStatus] = useState<VmStatusDto | null>(null);
  const [activeOp, setActiveOp] = useState<OperationDto | null>(null);
  const [auditItems, setAuditItems] = useState<AuditLogDto[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState<ActionKind | null>(null);
  const [message, setMessage] = useState("Loading instance status…");
  const [errorMessage, setErrorMessage] = useState("");
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pageSize = 10;

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const loadSessionIfNeeded = useCallback(async () => {
    if (user && csrfToken) return;
    const res = await fetch("/api/v1/auth/me");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (res.ok) {
      const json = await res.json();
      setUser(json.data.user);
      setCsrfToken(json.data.csrfToken);
    }
  }, [user, csrfToken, router]);

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/v1/vm/status");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Status unavailable");
      }
      const nextStatus: VmStatusDto = json.data;
      setStatus(nextStatus);
      if (nextStatus.activeOperation) {
        setActiveOp(nextStatus.activeOperation);
      }
      setErrorMessage("");
      setMessage("");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to retrieve status.",
      );
      setMessage("");
    } finally {
      setRefreshing(false);
    }
  }, [router]);

  const refreshAudit = useCallback(
    async (page: number) => {
      try {
        const res = await fetch(
          `/api/v1/audit?page=${page}&pageSize=${pageSize}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        setAuditItems(json.data.items ?? []);
        setAuditTotal(json.data.total ?? 0);
      } catch {
        // Non-fatal for audit panel
      }
    },
    [pageSize],
  );

  const pollOperation = useCallback(
    (operationId: string, attempt = 0) => {
      stopPolling();
      if (attempt >= MAX_OPERATION_POLLS) {
        setMessage(
          `Operation ${operationId} is still pending after bounded polling. Use Refresh to check status.`,
        );
        return;
      }

      const intervalMs =
        status?.source === "OCI"
          ? LIVE_POLL_INTERVAL_MS
          : MOCK_POLL_INTERVAL_MS;
      pollTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/v1/operations/${operationId}`);
          if (!res.ok) return;
          const json = await res.json();
          const op: OperationDto = json.data.operation;
          setActiveOp(op);

          if (op.status === "SUBMITTED" || op.status === "IN_PROGRESS") {
            pollOperation(operationId, attempt + 1);
          } else {
            setMessage(
              `Operation ${op.action} completed with status: ${op.status}`,
            );
            await Promise.all([refreshStatus(), refreshAudit(auditPage)]);
          }
        } catch {
          // Stop polling on transient fetch error; user can manually refresh
        }
      }, intervalMs);
    },
    [auditPage, refreshAudit, refreshStatus, status?.source, stopPolling],
  );

  useEffect(() => {
    void loadSessionIfNeeded();
    void refreshStatus();
    void refreshAudit(auditPage);
    const interval = setInterval(() => {
      void refreshStatus();
    }, 15000);
    return () => {
      clearInterval(interval);
      stopPolling();
    };
  }, [auditPage, loadSessionIfNeeded, refreshAudit, refreshStatus, stopPolling]);

  async function executeAction(action: ActionKind) {
    setBusy(true);
    setPendingAction(null);
    setErrorMessage("");
    setMessage(`Submitting ${action.toUpperCase()} operation…`);

    try {
      const res = await fetch(`/api/v1/vm/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Operation failed");
      }

      const op: OperationDto = json.data.operation;
      setActiveOp(op);
      setMessage(`Operation ${op.id} (${op.action}): ${op.status}`);
      await Promise.all([refreshStatus(), refreshAudit(1)]);
      setAuditPage(1);

      if (op.status === "SUBMITTED" || op.status === "IN_PROGRESS") {
        pollOperation(op.id, 0);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Operation failed.",
      );
      setMessage("");
      await refreshAudit(auditPage);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
      });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const lifecycle = status?.instanceStatus ?? "UNKNOWN";
  const isOperationActive =
    activeOp?.status === "SUBMITTED" || activeOp?.status === "IN_PROGRESS";
  const actionsLocked =
    busy || Boolean(user?.mustRotatePassword) || isOperationActive;

  const canStart = !actionsLocked && lifecycle === "STOPPED";
  const canStop = !actionsLocked && lifecycle === "RUNNING";
  const canRestart = !actionsLocked && lifecycle === "RUNNING";
  const canForceStop =
    !busy &&
    !user?.mustRotatePassword &&
    (lifecycle === "RUNNING" || lifecycle === "STOPPING");

  const totalPages = Math.max(1, Math.ceil(auditTotal / pageSize));
  const isLive = status?.source === "OCI";
  const isTransitional =
    lifecycle === "STARTING" || lifecycle === "STOPPING";

  return (
    <section className="panel panel-wide" aria-label="Oracle VM Manager Dashboard">
      <header className="dash-header">
        <div>
          <div className="brand-row">
            <span className="brand-icon" aria-hidden="true">
              <Server size={18} />
            </span>
            <p className="eyebrow">ORACLE VM MANAGER</p>
          </div>
          <h1>VM Dashboard</h1>
          <p className="muted">
            Administrator: {user?.displayName ?? "Vinay Ekbote"}
          </p>
        </div>

        <div className="header-controls">
          <span
            className={
              isLive ? "status status-running" : "status status-transitional"
            }
          >
            <span
              className={
                isLive ? "status-dot status-dot-pulse" : "status-dot"
              }
              aria-hidden="true"
            />
            {isLive ? "LIVE OCI" : "MOCK MODE"}
          </span>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void handleLogout()}
          >
            <LogOut size={15} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {user?.mustRotatePassword && (
        <PasswordRotationCard
          csrfToken={csrfToken}
          onRotated={(newToken) => {
            setCsrfToken(newToken);
            setUser((prev) =>
              prev ? { ...prev, mustRotatePassword: false } : prev,
            );
            setMessage("Administrator password rotated successfully.");
            void refreshAudit(1);
          }}
        />
      )}

      {status?.stale && (
        <div className="card warning-card" role="alert">
          <div className="warning-banner">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong>Provider state stale / UNKNOWN:</strong> Unable to reach
              the provider adapter. Power actions are disabled until
              authoritative state is restored.
            </div>
          </div>
        </div>
      )}

      <div className="bento-grid">
      <section className="card-giallo" aria-labelledby="instance-heading">
        <div className="row">
          <div className="instance-title-group">
            <span className="instance-icon" aria-hidden="true">
              <HardDrive size={18} />
            </span>
            <div>
              <h2 id="instance-heading">
                {status?.displayName ?? "Compute instance"}
              </h2>
              <p className="muted-sm">OCI Compute Virtual Machine</p>
            </div>
          </div>

          <span
            className={getStatusBadgeClass(lifecycle)}
            data-testid="vm-lifecycle-state"
          >
            <span
              className={
                lifecycle === "RUNNING" || isTransitional
                  ? "status-dot status-dot-pulse"
                  : "status-dot"
              }
              aria-hidden="true"
            />
            {lifecycle}
          </span>
        </div>

        <dl className="meta-grid">
          <div className="meta-cell">
            <dt>Region</dt>
            <dd>
              <Globe size={14} aria-hidden="true" />
              <span className="mono-cell">{status?.region ?? "us-phoenix-1"}</span>
            </dd>
          </div>
          <div className="meta-cell">
            <dt>Operating system</dt>
            <dd>{status?.os ?? "Oracle Linux"}</dd>
          </div>
          <div className="meta-cell">
            <dt>Public IP display</dt>
            <dd>
              <ShieldCheck size={14} aria-hidden="true" />
              <span>Disabled</span>
            </dd>
          </div>
          <div className="meta-cell">
            <dt>Last checked</dt>
            <dd className="tabular">
              <Clock size={14} aria-hidden="true" />
              <span>
                {status ? new Date(status.checkedAt).toLocaleString() : "—"}
              </span>
            </dd>
          </div>
        </dl>

        <div className="control-dock">
          <div className="actions-group">
            <button
              type="button"
              className="button button-primary"
              disabled={!canStart}
              onClick={() => setPendingAction("start")}
            >
              <Power size={15} aria-hidden="true" />
              <span>Start</span>
            </button>
            <button
              type="button"
              className="button danger-soft"
              disabled={!canStop}
              onClick={() => setPendingAction("stop")}
            >
              <Square size={14} aria-hidden="true" />
              <span>Graceful stop</span>
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={!canRestart}
              onClick={() => setPendingAction("restart")}
            >
              <RotateCw size={15} aria-hidden="true" />
              <span>Graceful restart</span>
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy || refreshing}
              onClick={() => {
                void refreshStatus();
                void refreshAudit(auditPage);
              }}
            >
              <RefreshCw
                size={15}
                className={refreshing ? "spin" : undefined}
                aria-hidden="true"
              />
              <span>Refresh</span>
            </button>
          </div>

          <button
            type="button"
            className="button danger"
            disabled={!canForceStop}
            onClick={() => setPendingAction("force-stop")}
          >
            <Zap size={15} aria-hidden="true" />
            <span>Force stop</span>
          </button>
        </div>

        {lifecycle === "STOPPING" && (
          <p className="muted-sm">
            Instance is shutting down gracefully. Use <strong>Force stop</strong>{" "}
            only if it remains stuck in <code className="mono-inline">STOPPING</code>.
          </p>
        )}

        {activeOp && (
          <div className="op-banner" role="status">
            <div className="actions-group">
              {isOperationActive && (
                <Loader2 size={15} className="spin" aria-hidden="true" />
              )}
              <span>
                <strong>Latest operation:</strong> {activeOp.action} ·{" "}
                <span data-testid="operation-status">{activeOp.status}</span>
                {activeOp.errorCode ? ` (${activeOp.errorCode})` : ""}
              </span>
            </div>
            <span className="mono-cell">
              {new Date(activeOp.requestedAt).toLocaleTimeString()}
            </span>
          </div>
        )}
      </section>

      {message && (
        <div className="feedback-bar" role="status">
          <span>{message}</span>
        </div>
      )}
      {errorMessage && (
        <p className="error" role="alert">
          {errorMessage}
        </p>
      )}

      <section className="card-giallo" aria-labelledby="audit-heading">
        <div className="row">
          <h2 id="audit-heading">Activity history</h2>
          <span className="muted-sm tabular">
            Page {auditPage} of {totalPages} ({auditTotal} total)
          </span>
        </div>

        {auditItems.length === 0 ? (
          <p className="muted-sm">No activity recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Time (UTC)</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {auditItems.map((item) => (
                  <tr key={item.id}>
                    <td className="mono-cell tabular">
                      {new Date(item.createdAt).toISOString()}
                    </td>
                    <td>{item.actor}</td>
                    <td className="mono-cell">{item.action}</td>
                    <td>
                      <span className={getOutcomeBadgeClass(item.outcome)}>
                        {item.outcome}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="actions">
          <button
            type="button"
            className="button secondary"
            disabled={auditPage <= 1}
            onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={15} aria-hidden="true" />
            <span>Previous</span>
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={auditPage >= totalPages}
            onClick={() => setAuditPage((p) => p + 1)}
          >
            <span>Next</span>
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </section>
      </div>

      <p className="notice">
        <ShieldCheck size={15} aria-hidden="true" />
        <span>
          {isLive
            ? "Connected to Oracle Cloud Infrastructure (OCI). Power actions operate on the configured Compute instance."
            : "This application runs in MOCK mode. Power actions do not contact Oracle Cloud Infrastructure or modify a live VM."}
        </span>
      </p>

      {pendingAction && (
        <ConfirmActionDialog
          open
          title={ACTION_META[pendingAction].title}
          description={
            isLive
              ? pendingAction === "force-stop"
                ? "This will immediately power off your Oracle Cloud Compute instance (STOP) without waiting for Oracle Linux to shut down cleanly."
                : `This will submit a ${pendingAction.toUpperCase()} operation to your configured Oracle Cloud Compute instance.`
              : ACTION_META[pendingAction].description
          }
          confirmLabel={ACTION_META[pendingAction].confirmLabel}
          variant={ACTION_META[pendingAction].variant}
          busy={busy}
          onConfirm={() => void executeAction(pendingAction)}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </section>
  );
}
