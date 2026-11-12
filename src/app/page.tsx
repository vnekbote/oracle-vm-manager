import Link from "next/link";
import { ArrowRight, Lock, Server, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="panel hero-panel">
        <div className="brand-row">
          <span className="brand-icon" aria-hidden="true">
            <Server size={20} />
          </span>
          <span className="eyebrow">ORACLE VM MANAGER</span>
        </div>

        <h1 className="hero-title">Instance control, without the console.</h1>
        <p className="muted hero-subtitle">
          A private, single-administrator control plane for monitoring and
          managing your Oracle Linux Compute instance in Phoenix (
          <code className="mono-inline">us-phoenix-1</code>).
        </p>

        <div className="feature-grid">
          <div className="feature-item">
            <ShieldCheck size={16} aria-hidden="true" className="feature-icon" />
            <div>
              <strong>Zero Public IP Exposure</strong>
              <p className="muted-sm">
                Instance networking and public IPs are never surfaced.
              </p>
            </div>
          </div>
          <div className="feature-item">
            <Lock size={16} aria-hidden="true" className="feature-icon" />
            <div>
              <strong>Hardened Session Control</strong>
              <p className="muted-sm">
                Argon2id auth, CSRF protection, and full audit history.
              </p>
            </div>
          </div>
        </div>

        <div className="actions">
          <Link className="button button-primary" href="/login">
            <span>Open administrator portal</span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
