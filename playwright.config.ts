import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { hashSync } from "@node-rs/argon2";

// Generate ephemeral per-run test credentials so no password is ever hardcoded.
const ephemeralPassword =
  process.env.E2E_TEST_PASSWORD ??
  `E2E-${randomBytes(12).toString("base64url")}!1a`;
const ephemeralHash = hashSync(ephemeralPassword, {
  algorithm: 2, // Argon2id
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
});

process.env.E2E_TEST_PASSWORD = ephemeralPassword;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    channel: "chrome",
  },
  webServer: {
    command: "npm run dev -- --port 3100 --hostname 127.0.0.1",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      APP_URL: "http://127.0.0.1:3100",
      VM_ADAPTER_MODE: "mock",
      ALLOW_IN_MEMORY_DB: "true",
      ADMIN_USERNAME: "Vinay Ekbote",
      ADMIN_PASSWORD_HASH: ephemeralHash,
      AUTH_SECRET: `e2e-secret-${randomBytes(16).toString("hex")}`,
    },
  },
});

