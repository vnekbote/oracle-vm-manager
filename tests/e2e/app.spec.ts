import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";

test("unauthenticated user is redirected from /dashboard to /login", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("admin signs in, rotates initial password, performs mock graceful stop, and signs out", async ({
  page,
}) => {
  const initialPassword = process.env.E2E_TEST_PASSWORD!;
  const rotatedPassword = `Rotated-${randomBytes(10).toString("base64url")}!9Z`;

  await page.goto("/login");
  await page.getByLabel("Username").fill("Vinay Ekbote");
  await page.getByLabel("Password").fill(initialPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("MOCK MODE", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Rotate initial administrator password"),
  ).toBeVisible();

  // VM power actions should be locked until initial password is rotated
  await expect(
    page.getByRole("button", { name: "Graceful stop" }),
  ).toBeDisabled();

  // Rotate password
  await page.getByLabel("Current password").fill(initialPassword);
  await page.getByLabel("New password", { exact: true }).fill(rotatedPassword);
  await page.getByLabel("Confirm new password").fill(rotatedPassword);
  await page.getByRole("button", { name: "Update password" }).click();

  await expect(
    page.getByText("Administrator password rotated successfully."),
  ).toBeVisible();

  // Now Graceful stop should be enabled (mock initial state is RUNNING)
  const stopBtn = page.getByRole("button", { name: "Graceful stop" });
  await expect(stopBtn).toBeEnabled();
  await stopBtn.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm Graceful Stop" }).click();

  // Wait for mock state transition to STOPPED
  await expect(page.getByTestId("vm-lifecycle-state")).toHaveText("STOPPED", {
    timeout: 10_000,
  });

  // Activity history should show the action
  await expect(page.getByText("VM_SOFTSTOP")).toBeVisible();

  // Sign out
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
});

