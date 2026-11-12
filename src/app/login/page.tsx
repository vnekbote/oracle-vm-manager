import { Lock } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="shell">
      <section className="panel narrow">
        <div className="brand-row">
          <span className="brand-icon" aria-hidden="true">
            <Lock size={18} />
          </span>
          <span className="eyebrow">SECURE ACCESS</span>
        </div>
        <h1>Sign in</h1>
        <p className="muted">
          Administrator access to Oracle VM Manager.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
