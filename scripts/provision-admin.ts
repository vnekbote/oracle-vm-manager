import { randomBytes } from "node:crypto";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadEnvConfig } from "@next/env";
import { hash } from "@node-rs/argon2";

loadEnvConfig(process.cwd());
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { users } from "../src/lib/database/schema";

const ARGON2_OPTIONS = {
  algorithm: 2 as const, // Argon2id
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};

async function readPasswordFromPrompt(): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    const pw = await rl.question(
      "Enter initial administrator password (min 12 chars): ",
    );
    return pw.trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const useDb = args.has("--db");
  const generate = args.has("--generate");
  const username = process.env.ADMIN_USERNAME ?? "Vinay Ekbote";

  let password = process.env.PROVISION_PASSWORD ?? "";
  let generatedOneTime = false;

  if (generate) {
    password = randomBytes(18).toString("base64url");
    generatedOneTime = true;
  } else if (!password) {
    password = await readPasswordFromPrompt();
  }

  if (password.length < 12) {
    console.error("Error: Password must be at least 12 characters.");
    process.exit(1);
  }

  const passwordHash = await hash(password, ARGON2_OPTIONS);

  if (useDb) {
    const url = process.env.DATABASE_URL;
    if (!url || (url.startsWith("[") && url.endsWith("]"))) {
      console.error("Error: Valid DATABASE_URL environment variable is required for --db.");
      process.exit(1);
    }

    const client = postgres(url, {
      prepare: false,
      max: 1,
      ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
    });
    const db = drizzle(client);
    const now = new Date();

    await db
      .insert(users)
      .values({
        username,
        displayName: username,
        passwordHash,
        role: "ADMIN",
        isActive: true,
        mustRotatePassword: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.username,
        set: {
          displayName: username,
          passwordHash,
          mustRotatePassword: true,
          isActive: true,
          updatedAt: now,
        },
      });

    await client.end();
    console.log(`Provisioned administrator '${username}' in database (mustRotatePassword=true).`);
  } else {
    const hashB64 = Buffer.from(passwordHash, "utf8").toString("base64");
    console.log(`# Add to .env.local (never commit) — base64 avoids Next.js $ expansion:`);
    console.log(`ADMIN_USERNAME="${username}"`);
    console.log(`ADMIN_PASSWORD_HASH_B64="${hashB64}"`);
  }

  if (generatedOneTime) {
    console.log(
      `One-time initial password (rotate immediately on first sign-in): ${password}`,
    );
  }
}

main().catch((err) => {
  console.error("Provisioning failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
