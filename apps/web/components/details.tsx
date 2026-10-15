"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Interview, Reminder } from "@prisma/client";
import {
  api,
  useResource,
  useUser,
  ResourceState,
  Badge,
  Feedback,
  dateTime,
  dateOnly,
  type AppRecord,
} from "../lib/client";
import { ApplicationForm } from "./application-form";
import { EventEditor } from "./schedule";
export function ApplicationDetails({ id }: { id: string }) {
  const {
    data: a,
    loading,
    error,
    refresh,
  } = useResource<AppRecord>(`/applications/${id}`);
  const user = useUser();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<{
    kind: "interviews" | "reminders";
    value?: Interview | Reminder;
  }>();
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function action(path: string, method: string, message: string) {
    setPending(true);
    setActionError("");
    setSuccess("");
    try {
      await api(path, method);
      setSuccess(message);
      refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Link className="back-link" href="/applications">
        ← All applications
      </Link>
      <ResourceState loading={loading} error={error} retry={refresh} />
      {a && !loading && (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">{a.company}</span>
              <h1>{a.jobTitle}</h1>
              <p>
                {a.location || "Location not specified"} ·{" "}
                <span className="capitalize">{a.arrangement}</span>{" "}
                <Badge status={a.status} />
              </p>
            </div>
            <div className="button-group">
              <button
                className="secondary"
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Close editor" : "Edit application"}
              </button>
              <button
                className="danger secondary"
                onClick={() => setDeleting(true)}
              >
                Delete
              </button>
            </div>
          </div>
          <Feedback error={actionError} success={success} />
          {deleting && (
            <section className="panel delete-confirm" role="alert">
              <h2>Delete this application?</h2>
              <p>
                This permanently removes {a.company}, its interviews, reminders
                and status history.
              </p>
              <div className="button-group">
                <button
                  className="secondary"
                  onClick={() => setDeleting(false)}
                >
                  Keep application
                </button>
                <button
                  className="danger"
                  disabled={pending}
                  onClick={async () => {
                    setPending(true);
                    try {
                      await api(`/applications/${id}`, "DELETE");
                      router.push("/applications");
                    } catch (e) {
                      setActionError((e as Error).message);
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  Delete permanently
                </button>
              </div>
            </section>
          )}
          {editing ? (
            <section className="panel form-panel">
              <ApplicationForm
                application={a}
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  refresh();
                  setSuccess("Application updated.");
                }}
              />
            </section>
          ) : (
            <div className="detail-grid">
              <div className="detail-main">
                <section className="panel">
                  <div className="section-heading">
                    <h2>Application details</h2>
                    {a.jobUrl && (
                      <a href={a.jobUrl} target="_blank" rel="noreferrer">
                        View job listing ↗
                      </a>
                    )}
                  </div>
                  <dl className="details-list">
                    <div>
                      <dt>Company</dt>
                      <dd>{a.company}</dd>
                    </div>
                    <div>
                      <dt>Date applied</dt>
                      <dd>{dateOnly(a.dateApplied)}</dd>
                    </div>
                    <div>
                      <dt>Salary range</dt>
                      <dd>
                        {a.salaryMin != null || a.salaryMax != null
                          ? `${a.currency} ${a.salaryMin?.toLocaleString() ?? "—"} – ${a.salaryMax?.toLocaleString() ?? "—"}`
                          : "Not specified"}
                      </dd>
                    </div>
                    <div>
                      <dt>Added</dt>
                      <dd>{dateTime(a.createdAt, user.timezone)}</dd>
                    </div>
                  </dl>
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <h2>Notes</h2>
                    <button
                      className="text-button"
                      onClick={() => setEditing(true)}
                    >
                      Edit notes ↗
                    </button>
                  </div>
                  <p className="notes">
                    {a.notes ||
                      "A place for research, impressions, and things to remember."}
                  </p>
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <h2>
                      Interviews{" "}
                      <span className="count-pill">{a.interviews.length}</span>
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => setEditor({ kind: "interviews" })}
                    >
                      ＋ Add interview
                    </button>
                  </div>
                  {a.interviews.length ? (
                    a.interviews.map((i) => (
                      <article className="detail-event" key={i.id}>
                        <div className="event-symbol">◷</div>
                        <div className="event-content">
                          <h3>{i.title}</h3>
                          <p>
                            {dateTime(i.startsAt, user.timezone)} · {i.format}
                            {i.duration ? ` · ${i.duration} min` : ""}
                          </p>
                          {i.meetingUrl && (
                            <a
                              href={i.meetingUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Join meeting ↗
                            </a>
                          )}
                          {i.location && <p>{i.location}</p>}
                          {i.notes && <p className="notes">{i.notes}</p>}
                          <div className="small-actions">
                            <button
                              onClick={() =>
                                setEditor({ kind: "interviews", value: i })
                              }
                            >
                              Edit
                            </button>
                            <button
                              disabled={pending}
                              onClick={() => {
                                if (window.confirm("Delete this interview?"))
                                  void action(
                                    `/applications/${id}/interviews/${i.id}`,
                                    "DELETE",
                                    "Interview deleted.",
                                  );
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty compact">
                      Good conversations start here. Add an interview when it’s
                      scheduled.
                    </div>
                  )}
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <h2>
                      Reminders{" "}
                      <span className="count-pill">{a.reminders.length}</span>
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => setEditor({ kind: "reminders" })}
                    >
                      ＋ Add reminder
                    </button>
                  </div>
                  {a.reminders.length ? (
                    a.reminders.map((r) => (
                      <article
                        className={`detail-event ${r.completedAt || r.cancelledAt ? "closed-reminder" : ""}`}
                        key={r.id}
                      >
                        <span className="check-circle">
                          {r.completedAt ? "✓" : ""}
                        </span>
                        <div className="event-content">
                          <h3>{r.message}</h3>
                          <p
                            className={
                              !r.completedAt &&
                              !r.cancelledAt &&
                              new Date(r.dueAt) < new Date()
                                ? "overdue-text"
                                : ""
                            }
                          >
                            {dateTime(r.dueAt, user.timezone)}
                          </p>
                          <small>
                            {r.completedAt
                              ? "Completed"
                              : r.cancelledAt
                                ? "Cancelled"
                                : "Open"}{" "}
                            · Email {r.deliveryStatus}
                            {r.lastError ? ` · ${r.lastError}` : ""}
                          </small>
                          <div className="small-actions">
                            {!r.completedAt && !r.cancelledAt && (
                              <>
                                <button
                                  disabled={pending}
                                  onClick={() =>
                                    void action(
                                      `/applications/${id}/reminders/${r.id}/complete`,
                                      "POST",
                                      "Reminder completed.",
                                    )
                                  }
                                >
                                  Mark complete
                                </button>
                                <button
                                  disabled={pending}
                                  onClick={() =>
                                    void action(
                                      `/applications/${id}/reminders/${r.id}/cancel`,
                                      "POST",
                                      "Reminder cancelled.",
                                    )
                                  }
                                >
                                  Cancel reminder
                                </button>
                              </>
                            )}
                            <button
                              onClick={() =>
                                setEditor({ kind: "reminders", value: r })
                              }
                            >
                              {r.completedAt ||
                              r.cancelledAt ||
                              r.deliveryStatus === "failed"
                                ? "Edit & reschedule"
                                : "Edit"}
                            </button>
                            <button
                              disabled={pending}
                              onClick={() => {
                                if (window.confirm("Delete this reminder?"))
                                  void action(
                                    `/applications/${id}/reminders/${r.id}`,
                                    "DELETE",
                                    "Reminder deleted.",
                                  );
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty compact">
                      Follow up with intention. Add a reminder for your next
                      step.
                    </div>
                  )}
                </section>
              </div>
              <aside className="panel history">
                <div className="section-heading">
                  <h2>Status timeline</h2>
                </div>
                <div className="history-list">
                  {a.history.map((h) => (
                    <div key={h.id}>
                      <span className="timeline-dot" />
                      <div>
                        <Badge status={h.toStatus} />
                        <small>
                          {h.fromStatus
                            ? `From ${h.fromStatus}`
                            : "Application added"}
                        </small>
                        <time>{dateTime(h.createdAt, user.timezone)}</time>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          )}
          {editor && (
            <EventEditor
              applicationId={id}
              kind={editor.kind}
              value={editor.value}
              onClose={() => setEditor(undefined)}
              onSaved={() => {
                setEditor(undefined);
                refresh();
                setSuccess("Schedule updated.");
              }}
            />
          )}
        </>
      )}
    </>
  );
}
