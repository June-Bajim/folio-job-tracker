"use client";
import { useState, type FormEvent } from "react";
import { api, Feedback, useUser, useHydrated } from "../lib/client";
export function AccountSecurity() {
  const user = useUser();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleting, setDeleting] = useState(false);
  async function password(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setError("");
    setSuccess("");
    if (f.get("newPassword") !== f.get("confirmPassword")) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/change-password", "POST", {
        currentPassword: f.get("currentPassword"),
        newPassword: f.get("newPassword"),
        revokeOtherSessions: true,
      });
      form.reset();
      setSuccess("Password changed. Other sessions have been signed out.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("confirmation") !== "DELETE") {
      setError("Type DELETE to confirm.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/auth/delete-user", "POST", {
        password: f.get("password"),
        confirmation: "DELETE",
      });
      window.location.assign("/login");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel settings-panel feature-panel">
        <h2>Account security</h2>
        <p className="muted">
          Email: {user.email} ·{" "}
          {user.emailVerified ? "Verified ✓" : "Not verified"}
        </p>
        <form method="post" onSubmit={password}>
          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          <label>
            New password
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
            />
          </label>
          <label>
            Confirm new password
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
            />
          </label>
          <button className="primary" disabled={busy || !hydrated}>
            Change password
          </button>
        </form>
      </section>
      <Feedback error={error} success={success} />
      <section className="panel settings-panel feature-panel delete-confirm">
        <h2>Delete account</h2>
        <p>
          This permanently deletes your applications, interviews, reminders,
          contacts, documents and every stored version, history, and active
          sessions. Download your CSV and documents first. This cannot be
          undone.
        </p>
        {!deleting ? (
          <button
            className="secondary danger"
            onClick={() => {
              setDeleting(true);
              setError("");
              setSuccess("");
            }}
          >
            Delete my account
          </button>
        ) : (
          <form method="post" onSubmit={remove}>
            <label>
              Your password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <label>
              Type DELETE to confirm
              <input
                name="confirmation"
                required
                pattern="DELETE"
                autoComplete="off"
              />
            </label>
            <div className="form-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setDeleting(false)}
              >
                Keep my account
              </button>
              <button className="danger" disabled={busy || !hydrated}>
                Permanently delete my account
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
