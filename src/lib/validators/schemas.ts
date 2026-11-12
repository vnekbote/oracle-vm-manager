import { z } from "zod";

export const loginSchema = z
  .object({
    username: z.string().trim().min(1, "Username is required").max(120),
    password: z.string().min(1, "Password is required").max(256),
  })
  .strict();

export const rotatePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(256),
    newPassword: z
      .string()
      .min(12, "New password must be at least 12 characters")
      .max(256)
      .regex(/[A-Z]/, "New password must include an uppercase letter")
      .regex(/[a-z]/, "New password must include a lowercase letter")
      .regex(/[0-9]/, "New password must include a number")
      .regex(/[^A-Za-z0-9]/, "New password must include a symbol"),
  })
  .strict();

/**
 * Strict schema for VM power action requests.
 * Rejects unknown fields (including any client-supplied instanceOcid/ocid)
 * to enforce the threat-model invariant that target instance identity is
 * strictly server-side configuration.
 */
export const vmActionRequestSchema = z
  .object({
    idempotencyKey: z
      .string()
      .trim()
      .min(8, "idempotencyKey must be at least 8 characters")
      .max(160, "idempotencyKey must be at most 160 characters")
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "idempotencyKey may only contain alphanumeric characters, hyphens, and underscores",
      ),
  })
  .strict();

export const operationIdParamSchema = z.object({
  id: z.string().uuid("Operation ID must be a valid UUID"),
});

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

