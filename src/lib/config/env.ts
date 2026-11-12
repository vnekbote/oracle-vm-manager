import "server-only";
import { existsSync, readFileSync } from "node:fs";

export interface OciLiveConfig {
  region: string;
  tenancyOcid: string;
  userOcid: string;
  fingerprint: string;
  privateKey: string;
  compartmentOcid: string;
  instanceOcid: string;
}

export interface AppConfig {
  appUrl: string;
  nodeEnv: string;
  vmAdapterMode: "mock" | "live";
  adminUsername: string;
  adminPasswordHash: string | null;
  authSecret: string;
  databaseUrl: string | null;
  allowInMemoryDb: boolean;
  ociRegion: string;
  ociCompartmentOcid: string;
  ociInstanceOcid: string;
  ociInstanceDisplayName: string;
  ociLive: OciLiveConfig | null;
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  return (
    trimmed.length === 0 ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

function normalizePrivateKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("-----BEGIN")) {
    return trimmed.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
  }
  if (existsSync(trimmed)) {
    return readFileSync(trimmed, "utf8").replace(/\r\n/g, "\n");
  }
  // Support base64-encoded PEM private key
  const decoded = Buffer.from(trimmed, "base64").toString("utf8");
  return decoded.replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
}

export function getAppConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const rawMode = process.env.VM_ADAPTER_MODE ?? "mock";

  if (rawMode !== "mock" && rawMode !== "live") {
    throw new Error(
      "VM_ADAPTER_MODE must be 'mock' or 'live'.",
    );
  }

  const authSecretRaw = process.env.AUTH_SECRET;
  let authSecret: string;
  if (!isPlaceholder(authSecretRaw)) {
    authSecret = authSecretRaw!;
  } else if (nodeEnv === "production") {
    throw new Error("AUTH_SECRET must be configured in production.");
  } else {
    // Ephemeral dev/test fallback only; never used in production.
    authSecret = "dev-ephemeral-secret-not-for-production-use";
  }

  const databaseUrl = !isPlaceholder(process.env.DATABASE_URL)
    ? process.env.DATABASE_URL!
    : null;

  const rawB64Hash = process.env.ADMIN_PASSWORD_HASH_B64;
  let adminPasswordHash: string | null = null;
  if (!isPlaceholder(rawB64Hash)) {
    adminPasswordHash = Buffer.from(rawB64Hash!, "base64").toString("utf8");
  } else if (!isPlaceholder(process.env.ADMIN_PASSWORD_HASH)) {
    const raw = process.env.ADMIN_PASSWORD_HASH!;
    // Support base64-encoded $argon2id$ hashes ("JGFyZ29u..." == "$argon...") even if placed in ADMIN_PASSWORD_HASH
    adminPasswordHash = raw.startsWith("JGFyZ29u")
      ? Buffer.from(raw, "base64").toString("utf8")
      : raw;
  }

  const ociRegion = process.env.OCI_REGION ?? "us-phoenix-1";
  const ociCompartmentOcid = !isPlaceholder(process.env.OCI_COMPARTMENT_OCID)
    ? process.env.OCI_COMPARTMENT_OCID!
    : "ocid1.compartment.oc1..mock-placeholder";
  const ociInstanceOcid = !isPlaceholder(process.env.OCI_INSTANCE_OCID)
    ? process.env.OCI_INSTANCE_OCID!
    : "ocid1.instance.oc1.phx.mock-placeholder";

  let ociLive: OciLiveConfig | null = null;
  if (rawMode === "live") {
    const tenancyOcid = process.env.OCI_TENANCY_OCID;
    const userOcid = process.env.OCI_USER_OCID;
    const fingerprint = process.env.OCI_FINGERPRINT;
    const privateKeyRaw = process.env.OCI_PRIVATE_KEY;

    if (
      isPlaceholder(tenancyOcid) ||
      isPlaceholder(userOcid) ||
      isPlaceholder(fingerprint) ||
      isPlaceholder(privateKeyRaw) ||
      isPlaceholder(process.env.OCI_COMPARTMENT_OCID) ||
      isPlaceholder(process.env.OCI_INSTANCE_OCID)
    ) {
      throw new Error(
        "VM_ADAPTER_MODE=live requires valid OCI_TENANCY_OCID, OCI_USER_OCID, OCI_FINGERPRINT, OCI_PRIVATE_KEY, OCI_COMPARTMENT_OCID, and OCI_INSTANCE_OCID.",
      );
    }

    ociLive = {
      region: ociRegion,
      tenancyOcid: tenancyOcid!,
      userOcid: userOcid!,
      fingerprint: fingerprint!,
      privateKey: normalizePrivateKey(privateKeyRaw!),
      compartmentOcid: process.env.OCI_COMPARTMENT_OCID!,
      instanceOcid: process.env.OCI_INSTANCE_OCID!,
    };
  }

  return {
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    nodeEnv,
    vmAdapterMode: rawMode,
    adminUsername: process.env.ADMIN_USERNAME ?? "Vinay Ekbote",
    adminPasswordHash,
    authSecret,
    databaseUrl,
    allowInMemoryDb:
      process.env.ALLOW_IN_MEMORY_DB === "true" || nodeEnv === "test",
    ociRegion,
    ociCompartmentOcid,
    ociInstanceOcid,
    ociInstanceDisplayName:
      process.env.OCI_INSTANCE_DISPLAY_NAME ?? "phoenix-oracle-linux-vm",
    ociLive,
  };
}
