"use client";

import { useState } from "react";

export interface PasswordRotationCardProps {
  csrfToken: string;
  onRotated: (newCsrfToken: string) => void;
}

export function PasswordRotationCard({
  csrfToken,
  onRotated,
}: PasswordRotationCardProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/rotate-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          json?.error?.message ?? "Unable to rotate password.",
        );
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onRotated(json.data.csrfToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rotate password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card warning-card" aria-labelledby="rotate-pw-heading">
      <p className="eyebrow">SECURITY REQUIREMENT</p>
      <h2 id="rotate-pw-heading">Rotate initial administrator password</h2>
      <p className="muted">
        You must rotate the initial provisioned password before executing VM
        power actions. Use at least 12 characters with uppercase, lowercase,
        numbers, and symbols.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Updating password…" : "Update password"}
        </button>
      </form>
    </section>
  );
}

