"use client";
import Link from "next/link";
import { useState } from "react";
import {
  api,
  Feedback,
  ResourceState,
  useResource,
  dateTime,
  useUser,
} from "../lib/client";
type Report = {
  pending: number;
  sent: number;
  failed: number;
  delayed: number;
  worker: {
    healthy: boolean;
    lastSeenAt: string | null;
    lastSuccessAt: string | null;
  };
  failures: {
    id: string;
    message: string;
    deliveryStatus: string;
    lastError: string | null;
    attempts: number;
    dueAt: string;
    application: { id: string; company: string; jobTitle: string };
    deliveryAttempts: {
      id: string;
      revision: number;
      outcome: string;
      error: string | null;
      createdAt: string;
    }[];
  }[];
};
export function DeliveryStatusView() {
  const { data, loading, error, refresh } =
    useResource<Report>("/delivery-status");
  const user = useUser();
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">NO FOLLOW-UP LEFT BEHIND</span>
          <h1>
            Email delivery<span className="green">.</span>
          </h1>
          <p>
            Track your reminder emails separately from completing the reminder
            itself.
          </p>
        </div>
        <button className="secondary" onClick={refresh}>
          Refresh status
        </button>
      </div>
      <ResourceState loading={loading} error={error} retry={refresh} />
      <Feedback error={actionError} success={success} />
      {data && !loading && (
        <>
          <div className="stats-grid">
            {[
              ["Pending", data.pending],
              ["Accepted by email provider", data.sent],
              ["Failed", data.failed],
              ["Delayed over 5 minutes", data.delayed],
            ].map(([label, count]) => (
              <div className="stat-card" key={label}>
                <span>{label}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
          <section className="panel feature-panel">
            <h2>
              Reminder worker:{" "}
              {data.worker.healthy ? "Healthy" : "Needs attention"}
            </h2>
            <p className="muted">
              {data.worker.lastSeenAt
                ? `Last seen ${dateTime(data.worker.lastSeenAt, user.timezone)}. `
                : "No recent worker heartbeat. "}
              Status is considered stale after two minutes. Delivery may be
              delayed while the worker or email provider recovers.
            </p>
            <p className="muted">
              Provider acceptance does not guarantee inbox delivery. Check spam
              or provider bounce logs if an accepted email is missing.
            </p>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Deliveries needing attention</h2>
            </div>
            {data.failures.length ? (
              data.failures.map((r) => (
                <article className="document-version" key={r.id}>
                  <h3>{r.message}</h3>
                  <Link href={`/applications/${r.application.id}`}>
                    {r.application.company} · {r.application.jobTitle} ↗
                  </Link>
                  <p>
                    {r.deliveryStatus} · {r.attempts} delivery attempt(s)
                  </p>
                  <p className="overdue-text">{r.lastError}</p>
                  {r.deliveryStatus === "failed" && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "Retry this email now? If a previous send was uncertain, check the email provider logs first to avoid a duplicate.",
                          )
                        )
                          return;
                        setBusy(true);
                        setActionError("");
                        try {
                          await api(`/reminders/${r.id}/retry`, "POST", {
                            confirm: true,
                          });
                          refresh();
                          setSuccess("A new delivery has been scheduled.");
                        } catch (e) {
                          setActionError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Retry delivery
                    </button>
                  )}
                  <details>
                    <summary>Delivery history</summary>
                    {r.deliveryAttempts.length ? (
                      r.deliveryAttempts.map((a) => (
                        <p key={a.id} className="muted">
                          {dateTime(a.createdAt, user.timezone)} · revision{" "}
                          {a.revision} · {a.outcome}
                          {a.error ? ` · ${a.error}` : ""}
                        </p>
                      ))
                    ) : (
                      <p className="muted">
                        No completed delivery attempts recorded.
                      </p>
                    )}
                  </details>
                </article>
              ))
            ) : (
              <div className="empty compact">
                No reminder delivery failures to review.
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
