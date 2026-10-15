"use client";
import Link from "next/link";
import { useState, useEffect, type FormEvent } from "react";
import { api, Feedback, useHydrated } from "../lib/client";
export function AuthForm({
  mode,
}: {
  mode: "login" | "register" | "forgot" | "reset";
}) {
  const hydrated = useHydrated();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (mode !== "login") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("error"))
      setError(
        "This verification link is invalid or expired. Request a new verification link.",
      );
    else if (params.get("verified") === "1")
      setSuccess("Email verified. You can now sign in.");
  }, [mode]);
  const title = {
    login: "Welcome back.",
    register: "Your next chapter starts here.",
    forgot: "Let’s get you back in.",
    reset: "A fresh start.",
  }[mode];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      if (mode === "forgot") {
        await api("/auth/request-password-reset", "POST", {
          email: f.get("email"),
          redirectTo: `${window.location.origin}/reset-password`,
        });
        setSuccess(
          "If an account exists, a reset link is on its way. Check your inbox.",
        );
      } else if (mode === "reset") {
        const token = new URLSearchParams(window.location.search).get("token");
        if (!token)
          throw new Error("This reset link is invalid. Request a new link.");
        await api("/auth/reset-password", "POST", {
          newPassword: f.get("password"),
          token,
        });
        setSuccess("Password updated. You can now sign in.");
      } else {
        await api(
          mode === "register" ? "/auth/sign-up/email" : "/auth/sign-in/email",
          "POST",
          {
            email: f.get("email"),
            password: f.get("password"),
            ...(mode === "register" ? { name: f.get("name") } : {}),
            callbackURL: `${window.location.origin}/login?verified=1`,
          },
        );
        window.location.assign(
          mode === "register"
            ? `/verify-email?email=${encodeURIComponent(String(f.get("email")))}`
            : "/dashboard",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link className="brand" href="/">
          folio.
        </Link>
        <div>
          <span className="eyebrow">A HOME FOR YOUR JOB SEARCH</span>
          <h1>
            Your ambition.
            <br />A little more
            <br />
            <em>organized.</em>
          </h1>
          <p>
            Keep track of the possibilities.
            <br />
            Make room for what’s next.
          </p>
        </div>
        <small>EVERY NEXT CHAPTER STARTS SOMEWHERE.</small>
      </section>
      <section className="auth-content">
        <div className="auth-card">
          <span className="eyebrow">LET’S MAKE YOUR NEXT MOVE</span>
          <h2>{title}</h2>
          <p className="muted">
            {mode === "login"
              ? "Sign in to pick up where you left off."
              : mode === "register"
                ? "Create your personal job search workspace."
                : "We’ll help you securely access your workspace."}
          </p>
          <form method="post" onSubmit={submit}>
            {mode === "register" && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
            )}
            {mode !== "forgot" && (
              <div className="password-field">
                <label htmlFor="password">
                  Password
                  <input
                    id="password"
                    name="password"
                    type="password"
                    aria-describedby="password-help"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={10}
                    maxLength={128}
                    required
                  />
                </label>
                <small id="password-help">At least 10 characters</small>
              </div>
            )}
            <Feedback error={error} success={success} />
            <button disabled={busy || !hydrated} className="primary full">
              {busy
                ? "Please wait…"
                : {
                    login: "Sign in →",
                    register: "Create account →",
                    forgot: "Send reset link →",
                    reset: "Set new password →",
                  }[mode]}
            </button>
          </form>
          <div className="auth-links">
            {mode === "login" ? (
              <>
                <Link href="/forgot-password">Forgot password?</Link>
                <p>
                  <Link href="/verify-email">Verify email or resend link</Link>
                </p>
                <p>
                  New here? <Link href="/register">Create an account</Link>
                </p>
              </>
            ) : (
              <Link href="/login">Back to sign in</Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
