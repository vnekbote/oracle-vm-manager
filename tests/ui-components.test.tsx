// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { LoginForm } from "../src/components/auth/login-form";
import { VmDashboard } from "../src/components/vm/vm-dashboard";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
    prefetch: vi.fn(),
  }),
}));

describe("UI Components", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("LoginForm submits to /api/v1/auth/login and displays error on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password." },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "not-valid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid username or password.");
  });

  it("VmDashboard renders MOCK MODE, hides public IP, and opens confirmation dialog", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/v1/vm/status")) {
        return new Response(
          JSON.stringify({
            data: {
              instanceStatus: "RUNNING",
              source: "MOCK",
              checkedAt: "2026-01-01T00:00:00.000Z",
              stale: false,
              region: "us-phoenix-1",
              os: "Oracle Linux",
              displayName: "phoenix-oracle-linux-vm",
              activeOperation: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/api/v1/audit")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  id: "log-1",
                  actor: "Vinay Ekbote",
                  action: "AUTH_LOGIN",
                  outcome: "SUCCESS",
                  requestId: "req-1",
                  metadata: null,
                  createdAt: "2026-01-01T00:00:00.000Z",
                },
              ],
              page: 1,
              pageSize: 10,
              total: 1,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    });

    render(
      <VmDashboard
        initialUser={{
          id: "u-1",
          username: "Vinay Ekbote",
          displayName: "Vinay Ekbote",
          role: "ADMIN",
          mustRotatePassword: false,
        }}
        initialCsrfToken="csrf-123"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("vm-lifecycle-state")).toHaveTextContent(
        "RUNNING",
      );
    });
    expect(screen.getByText("MOCK MODE")).toBeInTheDocument();
    expect(screen.getByText("us-phoenix-1")).toBeInTheDocument();
    expect(screen.getByText("Oracle Linux")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText("AUTH_LOGIN")).toBeInTheDocument();

    // Start button should be disabled when RUNNING
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();

    // Clicking Graceful stop opens accessible confirmation dialog
    fireEvent.click(screen.getByRole("button", { name: "Graceful stop" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Gracefully stop VM instance?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("VmDashboard enforces password rotation prompt before VM actions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            instanceStatus: "RUNNING",
            source: "MOCK",
            checkedAt: "2026-01-01T00:00:00.000Z",
            stale: false,
            region: "us-phoenix-1",
            os: "Oracle Linux",
            displayName: "phoenix-oracle-linux-vm",
            activeOperation: null,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <VmDashboard
        initialUser={{
          id: "u-1",
          username: "Vinay Ekbote",
          displayName: "Vinay Ekbote",
          role: "ADMIN",
          mustRotatePassword: true,
        }}
        initialCsrfToken="csrf-123"
      />,
    );

    expect(
      await screen.findByText("Rotate initial administrator password"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Graceful stop" }),
    ).toBeDisabled();
  });
});

