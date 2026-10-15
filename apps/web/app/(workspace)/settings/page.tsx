"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, useUser, Feedback, useHydrated } from "../../../lib/client";
export default function Settings() {
  const user = useUser();
  const hydrated = useHydrated();
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api("/me", "PUT", Object.fromEntries(f.entries()));
      router.refresh();
      setSuccess("Your preferences have been saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE YOURSELF AT HOME</span>
          <h1>
            Your preferences<span className="green">.</span>
          </h1>
          <p>A workspace that works on your time.</p>
        </div>
      </div>
      <section className="panel settings-panel">
        <h2>Personal information</h2>
        <p className="muted">Signed in as {user.email}</p>
        <form method="post" onSubmit={submit}>
          <label>
            Name
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={user.name}
            />
          </label>
          <label>
            Timezone
            <input
              name="timezone"
              required
              list="timezones"
              defaultValue={user.timezone}
            />
            <datalist id="timezones">
              {Intl.supportedValuesOf("timeZone").map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <small>
              Use an IANA timezone, such as Africa/Nairobi. Interviews and
              reminders will be displayed in this timezone.
            </small>
          </label>
          <Feedback error={error} success={success} />
          <button className="primary" disabled={busy || !hydrated}>
            {busy ? "Saving…" : "Save preferences"}
          </button>
        </form>
      </section>
    </>
  );
}
