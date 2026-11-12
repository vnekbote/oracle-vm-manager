"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";

export function LoginForm() {
  const [username, setUsername] = useState("Vinay Ekbote");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "signing-in" | "redirecting">(
    "idle",
  );
  const router = useRouter();
  const busy = phase !== "idle";

  useEffect(() => {
    router.prefetch("/dashboard");
  }, [router]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPhase("signing-in");
    setError("");
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          json?.error?.message ?? "Unable to sign in. Please check your credentials.",
        );
      }

      setPhase("redirecting");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
      setPhase("idle");
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="login-username">Username</label>
        <input
          id="login-username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="login-password">Password</label>
        <div className="input-wrap">
          <input
            id="login-password"
            name="password"
            className="input-with-toggle"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="icon-toggle"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((prev) => !prev)}
          >
            {showPassword ? (
              <EyeOff size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button button-primary" disabled={busy} type="submit">
        {busy ? (
          <>
            <Loader2 size={16} className="spin" aria-hidden="true" />
            <span>
              {phase === "redirecting" ? "Opening dashboard…" : "Signing in…"}
            </span>
          </>
        ) : (
          <>
            <LogIn size={16} aria-hidden="true" />
            <span>Sign in</span>
          </>
        )}
      </button>
    </form>
  );
}
