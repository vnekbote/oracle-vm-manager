import { vi } from "vitest";

// Next.js "server-only" throws outside the Next.js bundler; mock it in Vitest.
vi.mock("server-only", () => ({}));

