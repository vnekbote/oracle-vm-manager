import "server-only";
import { getAppConfig } from "@/lib/config/env";
import { getStore, type UserRecord } from "@/lib/database/store";

/**
 * Resolves the single configured administrator account ("Vinay Ekbote").
 * If the user does not yet exist in the database, bootstraps it ONLY from
 * a pre-generated Argon2id hash in ADMIN_PASSWORD_HASH (never a hardcoded password)
 * and marks mustRotatePassword=true until rotated.
 */
export async function resolveConfiguredAdmin(): Promise<UserRecord | null> {
  const cfg = getAppConfig();
  const store = getStore();

  const existing = await store.findUserByUsername(cfg.adminUsername);
  if (existing) {
    return existing;
  }

  if (cfg.adminPasswordHash) {
    return store.upsertAdminUser({
      username: cfg.adminUsername,
      displayName: cfg.adminUsername,
      passwordHash: cfg.adminPasswordHash,
      mustRotatePassword: true,
    });
  }

  return null;
}

