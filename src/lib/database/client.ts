import "server-only";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { getAppConfig } from "@/lib/config/env";

export class DatabaseUnavailableError extends Error {
  constructor(message = "Database is not configured or unavailable.") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

const globalForDb = globalThis as unknown as {
  __pgClient?: postgres.Sql;
  __drizzleDb?: PostgresJsDatabase<typeof schema>;
};

export function isDatabaseConfigured(): boolean {
  const { databaseUrl } = getAppConfig();
  return Boolean(databaseUrl);
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (globalForDb.__drizzleDb) return globalForDb.__drizzleDb;

  const { databaseUrl } = getAppConfig();
  if (!databaseUrl) {
    throw new DatabaseUnavailableError(
      "DATABASE_URL is not configured. Configure Supabase transaction-pooler URL or enable ALLOW_IN_MEMORY_DB=true for local mock testing.",
    );
  }

  // Transaction pooler configuration for Supabase Supavisor (port 6543):
  // prepare: false disables prepared statements; globalThis cache avoids HMR connection leaks.
  const client = postgres(databaseUrl, {
    prepare: false,
    max: 5,
    ssl:
      databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
        ? false
        : "require",
    connect_timeout: 10,
    idle_timeout: 20,
  });

  const db = drizzle(client, { schema });
  globalForDb.__pgClient = client;
  globalForDb.__drizzleDb = db;
  return db;
}
