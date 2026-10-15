"use client";
import Link from "next/link";
import { useState, useEffect, type FormEvent } from "react";
import { api, Feedback, useHydrated } from "../lib/client";
export function VerificationView() {
  const hydrated = useHydrated();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    setEmail(new URLSearchParams(window.location.search).get("email") ?? "");
  }, []);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/send-verification-email", "POST", {
        email,
        callbackURL: `${window.location.origin}/login?verified=1`,
      });
      setSuccess(
        "If this email needs verification, a fresh link is on its way. Check your inbox and spam folder.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page verification-page">
      <section className="panel auth-card">
        <Link className="brand" href="/login">
          folio.
        </Link>
        <h1>Check your email.</h1>
        <p>
          Open the verification link we sent you before signing in. Links expire
          after one hour. Existing accounts also need to verify their address.
        </p>
        <form method="post" onSubmit={send}>
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <Feedback error={error} success={success} />
          <button className="primary full" disabled={busy || !hydrated}>
            {busy ? "Sending…" : "Resend verification link"}
          </button>
        </form>
        <Link className="back-link" href="/login">
          Back to sign in →
        </Link>
      </section>
    </main>
  );
}
