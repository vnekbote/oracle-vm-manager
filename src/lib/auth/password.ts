import "server-only";
import { hash, verify } from "@node-rs/argon2";

const ARGON2_OPTIONS = {
  // 2 corresponds to Algorithm.Argon2id in @node-rs/argon2 (avoids ambient const enum under isolatedModules)
  algorithm: 2 as const,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
};

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2_OPTIONS);
}

export async function verifyPassword(
  storedHash: string,
  plainPassword: string,
): Promise<boolean> {
  if (!storedHash || !plainPassword) return false;
  try {
    return await verify(storedHash, plainPassword);
  } catch {
    return false;
  }
}
