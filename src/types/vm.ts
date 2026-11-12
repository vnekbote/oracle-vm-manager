export type VmLifecycleState =
  | "RUNNING"
  | "STOPPED"
  | "STARTING"
  | "STOPPING"
  | "TERMINATING"
  | "TERMINATED"
  | "UNKNOWN";

export type VmAction = "START" | "SOFTSTOP" | "STOP" | "SOFTRESET";

export type OperationStatus =
  | "SUBMITTED"
  | "IN_PROGRESS"
  | "SUCCEEDED"
  | "FAILED"
  | "TIMED_OUT";

export type AdapterSource = "MOCK" | "OCI";

export interface VmStatusDto {
  instanceStatus: VmLifecycleState;
  source: AdapterSource;
  checkedAt: string;
  stale: boolean;
  region: string;
  os: string;
  displayName: string;
  activeOperation?: OperationDto | null;
}

export interface OperationDto {
  id: string;
  action: VmAction;
  status: OperationStatus;
  idempotencyKey: string;
  providerRequestId: string | null;
  errorCode: string | null;
  requestedAt: string;
  completedAt: string | null;
}

export interface AuditLogDto {
  id: string;
  actor: string;
  action: string;
  outcome: "SUCCESS" | "FAILURE" | "DENIED" | "CONFLICT";
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuthUserDto {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN";
  mustRotatePassword: boolean;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

