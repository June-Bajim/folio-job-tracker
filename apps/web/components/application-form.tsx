"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  applicationSchema,
  statuses,
  arrangements,
} from "../../../packages/shared/schemas";
import {
  api,
  Feedback,
  dateOnly,
  useHydrated,
  type AppRecord,
} from "../lib/client";
export function ApplicationForm({
  application,
  onSaved,
  onCancel,
}: {
  application?: AppRecord;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const hydrated = useHydrated();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const obj = Object.fromEntries(f.entries());
    const result = applicationSchema.safeParse({
      ...obj,
      salaryMin: obj.salaryMin ? Number(obj.salaryMin) : null,
      salaryMax: obj.salaryMax ? Number(obj.salaryMax) : null,
      jobUrl: obj.jobUrl || null,
      dateApplied: obj.dateApplied || null,
    });
    if (!result.success) {
      setError(
        result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      );
      setBusy(false);
      return;
    }
    try {
      const a = await api<AppRecord>(
        application ? `/applications/${application.id}` : "/applications",
        application ? "PUT" : "POST",
        result.data,
      );
      if (onSaved) onSaved();
      else router.push(`/applications/${a.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form method="post" className="application-form" onSubmit={submit}>
      <div className="form-section">
        <h2>The opportunity</h2>
        <p className="muted">
          Start with the essentials. You can fill in the rest later.
        </p>
        <div className="form-grid">
          <label>
            Company <span>*</span>
            <input
              name="company"
              required
              maxLength={200}
              defaultValue={application?.company}
              placeholder="e.g. Acme Studio"
            />
          </label>
          <label>
            Job title <span>*</span>
            <input
              name="jobTitle"
              required
              maxLength={200}
              defaultValue={application?.jobTitle}
              placeholder="e.g. Product Designer"
            />
          </label>
          <label className="span-2">
            Job URL
            <input
              name="jobUrl"
              type="url"
              defaultValue={application?.jobUrl ?? ""}
              placeholder="https://…"
            />
          </label>
          <label>
            Location
            <input
              name="location"
              maxLength={300}
              defaultValue={application?.location}
            />
          </label>
          <label>
            Work arrangement
            <select
              aria-label="Work arrangement"
              name="arrangement"
              defaultValue={application?.arrangement ?? "remote"}
            >
              {arrangements.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              aria-label="Status"
              name="status"
              defaultValue={application?.status ?? "Saved"}
            >
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Date applied
            <input
              name="dateApplied"
              type="date"
              defaultValue={
                application?.dateApplied
                  ? dateOnly(application.dateApplied)
                  : ""
              }
            />
          </label>
        </div>
      </div>
      <div className="form-section">
        <h2>Compensation</h2>
        <div className="form-grid thirds">
          <label>
            Minimum salary
            <input
              name="salaryMin"
              type="number"
              min={0}
              max={2147483647}
              defaultValue={application?.salaryMin ?? ""}
            />
          </label>
          <label>
            Maximum salary
            <input
              name="salaryMax"
              type="number"
              min={0}
              max={2147483647}
              defaultValue={application?.salaryMax ?? ""}
            />
          </label>
          <label>
            Currency
            <input
              name="currency"
              required
              pattern="[A-Z]{3}"
              maxLength={3}
              defaultValue={application?.currency ?? "USD"}
            />
          </label>
        </div>
      </div>
      <div className="form-section">
        <label>
          Notes
          <textarea
            name="notes"
            rows={5}
            maxLength={20000}
            defaultValue={application?.notes}
            placeholder="What excites you about this role? Anything worth remembering?"
          />
        </label>
      </div>
      <Feedback error={error} />
      <div className="form-actions">
        <Link
          className="button secondary"
          href={
            application ? `/applications/${application.id}` : "/applications"
          }
          onClick={
            onCancel
              ? (e) => {
                  e.preventDefault();
                  onCancel();
                }
              : undefined
          }
        >
          Cancel
        </Link>
        <button className="primary" disabled={busy || !hydrated}>
          {busy
            ? "Saving…"
            : application
              ? "Save changes"
              : "Create application"}
        </button>
      </div>
    </form>
  );
}
