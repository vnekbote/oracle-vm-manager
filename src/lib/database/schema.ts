import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: varchar("username", { length: 120 }).notNull().unique(),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 32 }).notNull().default("ADMIN"),
  isActive: boolean("is_active").notNull().default(true),
  mustRotatePassword: boolean("must_rotate_password").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("sessions_user_id_idx").on(t.userId),
  }),
);

export const vmInstances = pgTable("vm_instances", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  instanceOcid: varchar("instance_ocid", { length: 512 }).notNull().unique(),
  region: varchar("region", { length: 80 }).notNull().default("us-phoenix-1"),
  compartmentOcid: varchar("compartment_ocid", { length: 512 }).notNull(),
  os: varchar("os", { length: 80 }).notNull().default("Oracle Linux"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vmOperations = pgTable(
  "vm_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    vmId: uuid("vm_id")
      .notNull()
      .references(() => vmInstances.id),
    action: varchar("action", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    providerRequestId: varchar("provider_request_id", { length: 255 }),
    errorCode: varchar("error_code", { length: 100 }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    idem: uniqueIndex("vm_operations_idempotency_key_uq").on(t.idempotencyKey),
    vmStatusIdx: index("vm_operations_vm_status_idx").on(t.vmId, t.status),
  }),
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id),
    action: varchar("action", { length: 120 }).notNull(),
    outcome: varchar("outcome", { length: 40 }).notNull(),
    requestId: varchar("request_id", { length: 160 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
  }),
);
