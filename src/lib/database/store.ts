import "server-only";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getAppConfig } from "@/lib/config/env";
import { DatabaseUnavailableError, getDb, isDatabaseConfigured } from "./client";
import {
  auditLogs,
  sessions,
  users,
  vmInstances,
  vmOperations,
} from "./schema";
import type {
  AuditLogDto,
  OperationDto,
  OperationStatus,
  VmAction,
} from "@/types/vm";
import { redactMetadata } from "@/lib/security/redact";

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: "ADMIN";
  isActive: boolean;
  mustRotatePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface VmInstanceRecord {
  id: string;
  displayName: string;
  instanceOcid: string;
  region: string;
  compartmentOcid: string;
  os: string;
  createdAt: Date;
}

export interface PersistenceStore {
  findUserByUsername(username: string): Promise<UserRecord | null>;
  findUserById(userId: string): Promise<UserRecord | null>;
  upsertAdminUser(input: {
    username: string;
    displayName: string;
    passwordHash: string;
    mustRotatePassword: boolean;
  }): Promise<UserRecord>;
  updateUserPassword(
    userId: string,
    passwordHash: string,
    mustRotatePassword: boolean,
  ): Promise<void>;

  createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<SessionRecord>;
  findActiveSessionByTokenHash(
    tokenHash: string,
    now?: Date,
  ): Promise<{ session: SessionRecord; user: UserRecord } | null>;
  touchSession(sessionId: string, now?: Date): Promise<void>;
  revokeSession(sessionId: string, now?: Date): Promise<void>;
  revokeAllUserSessions(userId: string, now?: Date): Promise<void>;

  ensureConfiguredVmInstance(input: {
    displayName: string;
    instanceOcid: string;
    region: string;
    compartmentOcid: string;
    os: string;
  }): Promise<VmInstanceRecord>;

  findOperationById(
    id: string,
    userId: string,
  ): Promise<OperationDto | null>;
  findOperationByIdempotencyKey(
    idempotencyKey: string,
    userId: string,
  ): Promise<OperationDto | null>;
  findActiveOperationsForVm(vmId: string): Promise<OperationDto[]>;
  createOperation(input: {
    id?: string;
    userId: string;
    vmId: string;
    action: VmAction;
    status: OperationStatus;
    idempotencyKey: string;
    providerRequestId?: string | null;
  }): Promise<OperationDto>;
  updateOperation(
    id: string,
    patch: {
      status?: OperationStatus;
      providerRequestId?: string | null;
      errorCode?: string | null;
      completedAt?: Date | null;
    },
  ): Promise<OperationDto | null>;

  createAuditLog(input: {
    userId: string | null;
    action: string;
    outcome: "SUCCESS" | "FAILURE" | "DENIED" | "CONFLICT";
    requestId: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void>;
  listAuditLogs(input: {
    userId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: AuditLogDto[]; total: number }>;
}

function toOperationDto(row: typeof vmOperations.$inferSelect): OperationDto {
  return {
    id: row.id,
    action: row.action as VmAction,
    status: row.status as OperationStatus,
    idempotencyKey: row.idempotencyKey,
    providerRequestId: row.providerRequestId ?? null,
    errorCode: row.errorCode ?? null,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

function wrapDbError(err: unknown): never {
  if (err instanceof DatabaseUnavailableError) throw err;
  const message = err instanceof Error ? err.message : "Database error";
  if (
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|CONNECT_TIMEOUT|connection/i.test(
      message,
    )
  ) {
    throw new DatabaseUnavailableError("Database connection unavailable.");
  }
  throw err;
}

export class DrizzlePersistenceStore implements PersistenceStore {
  async findUserByUsername(username: string): Promise<UserRecord | null> {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        ...row,
        role: "ADMIN",
      };
    } catch (err) {
      wrapDbError(err);
    }
  }

  async findUserById(userId: string): Promise<UserRecord | null> {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        ...row,
        role: "ADMIN",
      };
    } catch (err) {
      wrapDbError(err);
    }
  }

  async upsertAdminUser(input: {
    username: string;
    displayName: string;
    passwordHash: string;
    mustRotatePassword: boolean;
  }): Promise<UserRecord> {
    try {
      const db = getDb();
      const now = new Date();
      const [row] = await db
        .insert(users)
        .values({
          username: input.username,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          role: "ADMIN",
          isActive: true,
          mustRotatePassword: input.mustRotatePassword,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: users.username,
          set: {
            displayName: input.displayName,
            passwordHash: input.passwordHash,
            mustRotatePassword: input.mustRotatePassword,
            isActive: true,
            updatedAt: now,
          },
        })
        .returning();
      return { ...row, role: "ADMIN" };
    } catch (err) {
      wrapDbError(err);
    }
  }

  async updateUserPassword(
    userId: string,
    passwordHash: string,
    mustRotatePassword: boolean,
  ): Promise<void> {
    try {
      const db = getDb();
      await db
        .update(users)
        .set({
          passwordHash,
          mustRotatePassword,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    } catch (err) {
      wrapDbError(err);
    }
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<SessionRecord> {
    try {
      const db = getDb();
      const [row] = await db
        .insert(sessions)
        .values({
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        })
        .returning();
      return row;
    } catch (err) {
      wrapDbError(err);
    }
  }

  async findActiveSessionByTokenHash(
    tokenHash: string,
    now: Date = new Date(),
  ): Promise<{ session: SessionRecord; user: UserRecord } | null> {
    try {
      const db = getDb();
      const rows = await db
        .select({ session: sessions, user: users })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now),
            eq(users.isActive, true),
          ),
        )
        .limit(1);

      const match = rows[0];
      if (!match) return null;
      return {
        session: match.session,
        user: { ...match.user, role: "ADMIN" },
      };
    } catch (err) {
      wrapDbError(err);
    }
  }

  async touchSession(sessionId: string, now: Date = new Date()): Promise<void> {
    try {
      const db = getDb();
      await db
        .update(sessions)
        .set({ lastSeenAt: now })
        .where(eq(sessions.id, sessionId));
    } catch (err) {
      wrapDbError(err);
    }
  }

  async revokeSession(sessionId: string, now: Date = new Date()): Promise<void> {
    try {
      const db = getDb();
      await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(eq(sessions.id, sessionId));
    } catch (err) {
      wrapDbError(err);
    }
  }

  async revokeAllUserSessions(
    userId: string,
    now: Date = new Date(),
  ): Promise<void> {
    try {
      const db = getDb();
      await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    } catch (err) {
      wrapDbError(err);
    }
  }

  async ensureConfiguredVmInstance(input: {
    displayName: string;
    instanceOcid: string;
    region: string;
    compartmentOcid: string;
    os: string;
  }): Promise<VmInstanceRecord> {
    try {
      const db = getDb();
      const [row] = await db
        .insert(vmInstances)
        .values({
          displayName: input.displayName,
          instanceOcid: input.instanceOcid,
          region: input.region,
          compartmentOcid: input.compartmentOcid,
          os: input.os,
        })
        .onConflictDoUpdate({
          target: vmInstances.instanceOcid,
          set: {
            displayName: input.displayName,
            region: input.region,
            compartmentOcid: input.compartmentOcid,
            os: input.os,
          },
        })
        .returning();
      return row;
    } catch (err) {
      wrapDbError(err);
    }
  }

  async findOperationById(
    id: string,
    userId: string,
  ): Promise<OperationDto | null> {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(vmOperations)
        .where(and(eq(vmOperations.id, id), eq(vmOperations.userId, userId)))
        .limit(1);
      return rows[0] ? toOperationDto(rows[0]) : null;
    } catch (err) {
      wrapDbError(err);
    }
  }

  async findOperationByIdempotencyKey(
    idempotencyKey: string,
    userId: string,
  ): Promise<OperationDto | null> {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(vmOperations)
        .where(
          and(
            eq(vmOperations.idempotencyKey, idempotencyKey),
            eq(vmOperations.userId, userId),
          ),
        )
        .limit(1);
      return rows[0] ? toOperationDto(rows[0]) : null;
    } catch (err) {
      wrapDbError(err);
    }
  }

  async findActiveOperationsForVm(vmId: string): Promise<OperationDto[]> {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(vmOperations)
        .where(
          and(
            eq(vmOperations.vmId, vmId),
            inArray(vmOperations.status, ["SUBMITTED", "IN_PROGRESS"]),
          ),
        )
        .orderBy(desc(vmOperations.requestedAt));
      return rows.map(toOperationDto);
    } catch (err) {
      wrapDbError(err);
    }
  }

  async createOperation(input: {
    id?: string;
    userId: string;
    vmId: string;
    action: VmAction;
    status: OperationStatus;
    idempotencyKey: string;
    providerRequestId?: string | null;
  }): Promise<OperationDto> {
    try {
      const db = getDb();
      const [row] = await db
        .insert(vmOperations)
        .values({
          ...(input.id ? { id: input.id } : {}),
          userId: input.userId,
          vmId: input.vmId,
          action: input.action,
          status: input.status,
          idempotencyKey: input.idempotencyKey,
          providerRequestId: input.providerRequestId ?? null,
        })
        .returning();
      return toOperationDto(row);
    } catch (err) {
      wrapDbError(err);
    }
  }

  async updateOperation(
    id: string,
    patch: {
      status?: OperationStatus;
      providerRequestId?: string | null;
      errorCode?: string | null;
      completedAt?: Date | null;
    },
  ): Promise<OperationDto | null> {
    try {
      const db = getDb();
      const [row] = await db
        .update(vmOperations)
        .set({
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.providerRequestId !== undefined
            ? { providerRequestId: patch.providerRequestId }
            : {}),
          ...(patch.errorCode !== undefined
            ? { errorCode: patch.errorCode }
            : {}),
          ...(patch.completedAt !== undefined
            ? { completedAt: patch.completedAt }
            : {}),
        })
        .where(eq(vmOperations.id, id))
        .returning();
      return row ? toOperationDto(row) : null;
    } catch (err) {
      wrapDbError(err);
    }
  }

  async createAuditLog(input: {
    userId: string | null;
    action: string;
    outcome: "SUCCESS" | "FAILURE" | "DENIED" | "CONFLICT";
    requestId: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      const db = getDb();
      await db.insert(auditLogs).values({
        userId: input.userId,
        action: input.action,
        outcome: input.outcome,
        requestId: input.requestId,
        metadata: redactMetadata(input.metadata),
      });
    } catch (err) {
      wrapDbError(err);
    }
  }

  async listAuditLogs(input: {
    userId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: AuditLogDto[]; total: number }> {
    try {
      const db = getDb();
      const offset = (input.page - 1) * input.pageSize;

      const [rows, countRows] = await Promise.all([
        db
          .select({
            log: auditLogs,
            displayName: users.displayName,
          })
          .from(auditLogs)
          .leftJoin(users, eq(auditLogs.userId, users.id))
          .orderBy(desc(auditLogs.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(auditLogs),
      ]);

      return {
        items: rows.map(({ log, displayName }) => ({
          id: log.id,
          actor: displayName ?? "System",
          action: log.action,
          outcome: log.outcome as AuditLogDto["outcome"],
          requestId: log.requestId ?? null,
          metadata: redactMetadata(log.metadata),
          createdAt: log.createdAt.toISOString(),
        })),
        total: countRows[0]?.count ?? 0,
      };
    } catch (err) {
      wrapDbError(err);
    }
  }
}

interface InMemoryOperationRow {
  id: string;
  userId: string;
  vmId: string;
  action: VmAction;
  status: OperationStatus;
  idempotencyKey: string;
  providerRequestId: string | null;
  errorCode: string | null;
  requestedAt: Date;
  completedAt: Date | null;
}

interface InMemoryAuditRow {
  id: string;
  userId: string | null;
  action: string;
  outcome: "SUCCESS" | "FAILURE" | "DENIED" | "CONFLICT";
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export class InMemoryPersistenceStore implements PersistenceStore {
  private readonly usersMap = new Map<string, UserRecord>();
  private readonly sessionsMap = new Map<string, SessionRecord>();
  private readonly vmsMap = new Map<string, VmInstanceRecord>();
  private readonly opsMap = new Map<string, InMemoryOperationRow>();
  private readonly audits: InMemoryAuditRow[] = [];

  clear(): void {
    this.usersMap.clear();
    this.sessionsMap.clear();
    this.vmsMap.clear();
    this.opsMap.clear();
    this.audits.length = 0;
  }

  async findUserByUsername(username: string): Promise<UserRecord | null> {
    for (const user of this.usersMap.values()) {
      if (user.username === username) return user;
    }
    return null;
  }

  async findUserById(userId: string): Promise<UserRecord | null> {
    return this.usersMap.get(userId) ?? null;
  }

  async upsertAdminUser(input: {
    username: string;
    displayName: string;
    passwordHash: string;
    mustRotatePassword: boolean;
  }): Promise<UserRecord> {
    const existing = await this.findUserByUsername(input.username);
    const now = new Date();
    if (existing) {
      const updated: UserRecord = {
        ...existing,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        mustRotatePassword: input.mustRotatePassword,
        isActive: true,
        updatedAt: now,
      };
      this.usersMap.set(updated.id, updated);
      return updated;
    }
    const created: UserRecord = {
      id: crypto.randomUUID(),
      username: input.username,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      role: "ADMIN",
      isActive: true,
      mustRotatePassword: input.mustRotatePassword,
      createdAt: now,
      updatedAt: now,
    };
    this.usersMap.set(created.id, created);
    return created;
  }

  async updateUserPassword(
    userId: string,
    passwordHash: string,
    mustRotatePassword: boolean,
  ): Promise<void> {
    const existing = this.usersMap.get(userId);
    if (!existing) return;
    this.usersMap.set(userId, {
      ...existing,
      passwordHash,
      mustRotatePassword,
      updatedAt: new Date(),
    });
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<SessionRecord> {
    const now = new Date();
    const record: SessionRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: now,
      lastSeenAt: now,
    };
    this.sessionsMap.set(record.id, record);
    return record;
  }

  async findActiveSessionByTokenHash(
    tokenHash: string,
    now: Date = new Date(),
  ): Promise<{ session: SessionRecord; user: UserRecord } | null> {
    for (const session of this.sessionsMap.values()) {
      if (
        session.tokenHash === tokenHash &&
        session.revokedAt === null &&
        session.expiresAt > now
      ) {
        const user = this.usersMap.get(session.userId);
        if (user && user.isActive) {
          return { session, user };
        }
      }
    }
    return null;
  }

  async touchSession(sessionId: string, now: Date = new Date()): Promise<void> {
    const session = this.sessionsMap.get(sessionId);
    if (session) {
      this.sessionsMap.set(sessionId, { ...session, lastSeenAt: now });
    }
  }

  async revokeSession(sessionId: string, now: Date = new Date()): Promise<void> {
    const session = this.sessionsMap.get(sessionId);
    if (session) {
      this.sessionsMap.set(sessionId, { ...session, revokedAt: now });
    }
  }

  async revokeAllUserSessions(
    userId: string,
    now: Date = new Date(),
  ): Promise<void> {
    for (const [id, session] of this.sessionsMap.entries()) {
      if (session.userId === userId && session.revokedAt === null) {
        this.sessionsMap.set(id, { ...session, revokedAt: now });
      }
    }
  }

  async ensureConfiguredVmInstance(input: {
    displayName: string;
    instanceOcid: string;
    region: string;
    compartmentOcid: string;
    os: string;
  }): Promise<VmInstanceRecord> {
    for (const vm of this.vmsMap.values()) {
      if (vm.instanceOcid === input.instanceOcid) {
        const updated = { ...vm, ...input };
        this.vmsMap.set(vm.id, updated);
        return updated;
      }
    }
    const created: VmInstanceRecord = {
      id: crypto.randomUUID(),
      ...input,
      createdAt: new Date(),
    };
    this.vmsMap.set(created.id, created);
    return created;
  }

  async findOperationById(
    id: string,
    userId: string,
  ): Promise<OperationDto | null> {
    const row = this.opsMap.get(id);
    if (!row || row.userId !== userId) return null;
    return this.toDto(row);
  }

  async findOperationByIdempotencyKey(
    idempotencyKey: string,
    userId: string,
  ): Promise<OperationDto | null> {
    for (const row of this.opsMap.values()) {
      if (row.idempotencyKey === idempotencyKey && row.userId === userId) {
        return this.toDto(row);
      }
    }
    return null;
  }

  async findActiveOperationsForVm(vmId: string): Promise<OperationDto[]> {
    const active: InMemoryOperationRow[] = [];
    for (const row of this.opsMap.values()) {
      if (
        row.vmId === vmId &&
        (row.status === "SUBMITTED" || row.status === "IN_PROGRESS")
      ) {
        active.push(row);
      }
    }
    active.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
    return active.map((r) => this.toDto(r));
  }

  async createOperation(input: {
    id?: string;
    userId: string;
    vmId: string;
    action: VmAction;
    status: OperationStatus;
    idempotencyKey: string;
    providerRequestId?: string | null;
  }): Promise<OperationDto> {
    const row: InMemoryOperationRow = {
      id: input.id ?? crypto.randomUUID(),
      userId: input.userId,
      vmId: input.vmId,
      action: input.action,
      status: input.status,
      idempotencyKey: input.idempotencyKey,
      providerRequestId: input.providerRequestId ?? null,
      errorCode: null,
      requestedAt: new Date(),
      completedAt: null,
    };
    this.opsMap.set(row.id, row);
    return this.toDto(row);
  }

  async updateOperation(
    id: string,
    patch: {
      status?: OperationStatus;
      providerRequestId?: string | null;
      errorCode?: string | null;
      completedAt?: Date | null;
    },
  ): Promise<OperationDto | null> {
    const existing = this.opsMap.get(id);
    if (!existing) return null;
    const updated: InMemoryOperationRow = {
      ...existing,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.providerRequestId !== undefined
        ? { providerRequestId: patch.providerRequestId }
        : {}),
      ...(patch.errorCode !== undefined ? { errorCode: patch.errorCode } : {}),
      ...(patch.completedAt !== undefined
        ? { completedAt: patch.completedAt }
        : {}),
    };
    this.opsMap.set(id, updated);
    return this.toDto(updated);
  }

  async createAuditLog(input: {
    userId: string | null;
    action: string;
    outcome: "SUCCESS" | "FAILURE" | "DENIED" | "CONFLICT";
    requestId: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    this.audits.unshift({
      id: crypto.randomUUID(),
      userId: input.userId,
      action: input.action,
      outcome: input.outcome,
      requestId: input.requestId,
      metadata: redactMetadata(input.metadata),
      createdAt: new Date(),
    });
  }

  async listAuditLogs(input: {
    userId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: AuditLogDto[]; total: number }> {
    const start = (input.page - 1) * input.pageSize;
    const slice = this.audits.slice(start, start + input.pageSize);
    return {
      items: slice.map((log) => {
        const actor =
          (log.userId ? this.usersMap.get(log.userId)?.displayName : null) ??
          "System";
        return {
          id: log.id,
          actor,
          action: log.action,
          outcome: log.outcome,
          requestId: log.requestId,
          metadata: redactMetadata(log.metadata),
          createdAt: log.createdAt.toISOString(),
        };
      }),
      total: this.audits.length,
    };
  }

  private toDto(row: InMemoryOperationRow): OperationDto {
    return {
      id: row.id,
      action: row.action,
      status: row.status,
      idempotencyKey: row.idempotencyKey,
      providerRequestId: row.providerRequestId,
      errorCode: row.errorCode,
      requestedAt: row.requestedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    };
  }
}

const globalForStore = globalThis as unknown as {
  __inMemoryStore?: InMemoryPersistenceStore;
};

export function getInMemoryStore(): InMemoryPersistenceStore {
  if (!globalForStore.__inMemoryStore) {
    globalForStore.__inMemoryStore = new InMemoryPersistenceStore();
  }
  return globalForStore.__inMemoryStore;
}

export function getStore(): PersistenceStore {
  if (isDatabaseConfigured()) {
    return new DrizzlePersistenceStore();
  }
  const { allowInMemoryDb } = getAppConfig();
  if (allowInMemoryDb) {
    return getInMemoryStore();
  }
  throw new DatabaseUnavailableError();
}

