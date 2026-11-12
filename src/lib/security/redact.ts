const SENSITIVE_KEY_PATTERN =
  /password|hash|secret|token|cookie|private[_-]?key|authorization|session|credential|database_url/i;

export function redactMetadata(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!input) return null;

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = "[REDACTED]";
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = redactMetadata(value as Record<string, unknown>);
    } else if (typeof value === "string" && value.length > 500) {
      output[key] = `${value.slice(0, 120)}...[TRUNCATED]`;
    } else {
      output[key] = value;
    }
  }
  return output;
}

export function logStructured(
  level: "info" | "warn" | "error",
  event: string,
  details?: Record<string, unknown>,
): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(details ? { details: redactMetadata(details) } : {}),
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
  } else if (level === "warn") {
    console.warn(JSON.stringify(payload));
  } else {
    console.info(JSON.stringify(payload));
  }
}

