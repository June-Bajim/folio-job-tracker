"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import {
  api,
  Feedback,
  useUser,
  dateTime,
  useResource,
  ResourceState,
  type ScheduledInterview,
  type ScheduledReminder,
} from "../lib/client";
type InterviewValues = {
  id?: string;
  title: string;
  startsAt: Date | string;
  duration: number | null;
  format: string;
  meetingUrl: string | null;
  location: string;
  notes: string;
};
type ReminderValues = { id?: string; message: string; dueAt: Date | string };
export function EventEditor({
  applicationId,
  kind,
  value,
  onClose,
  onSaved,
}: {
  applicationId: string;
  kind: "interviews" | "reminders";
  value?: InterviewValues | ReminderValues;
  onClose: () => void;
  onSaved: () => void;
}) {
  const user = useUser();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isInterview = kind === "interviews";
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  const i = value as InterviewValues | undefined;
  const r = value as ReminderValues | undefined;
  const local = (date: Date | string | undefined) =>
    date
      ? DateTime.fromISO(new Date(date).toISOString())
          .setZone(user.timezone)
          .toFormat("yyyy-MM-dd'T'HH:mm")
      : "";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const obj = Object.fromEntries(f.entries());
    try {
      const time = DateTime.fromISO(String(obj.time), { zone: user.timezone });
      if (!time.isValid) throw new Error("Enter a valid date and time");
      // Reject DST gaps that Luxon would silently move forward.
      if (time.toFormat("yyyy-MM-dd'T'HH:mm") !== obj.time)
        throw new Error(
          "This time does not exist in your timezone due to daylight saving. Choose another time.",
        );
      const body = isInterview
        ? {
            title: obj.title,
            startsAt: time.toUTC().toISO(),
            duration: obj.duration ? Number(obj.duration) : null,
            format: obj.format,
            meetingUrl: obj.meetingUrl || null,
            location: obj.location,
            notes: obj.notes,
          }
        : { message: obj.message, dueAt: time.toUTC().toISO() };
      await api(
        `/applications/${applicationId}/${kind}${value?.id ? `/${value.id}` : ""}`,
        value?.id ? "PUT" : "POST",
        body,
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={dialog} onCancel={onClose} className="event-dialog">
      <div className="section-heading">
        <h2>
          {value ? "Edit" : "Add"} {isInterview ? "interview" : "reminder"}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p className="muted">
        Times are in {user.timezone}.{" "}
        {isInterview
          ? "Make space for a good conversation."
          : "A nudge for your future self."}
      </p>
      <form onSubmit={submit}>
        {isInterview ? (
          <label>
            Interview title
            <input
              autoFocus
              name="title"
              required
              maxLength={200}
              defaultValue={i?.title}
            />
          </label>
        ) : (
          <label>
            Reminder message
            <textarea
              autoFocus
              name="message"
              required
              maxLength={2000}
              defaultValue={r?.message}
            />
          </label>
        )}
        <label>
          {isInterview ? "Starts at" : "Due at"} ({user.timezone})
          <input
            name="time"
            type="datetime-local"
            required
            defaultValue={local(isInterview ? i?.startsAt : r?.dueAt)}
          />
        </label>
        {isInterview && (
          <>
            <div className="form-grid">
              <label>
                Duration (minutes)
                <input
                  name="duration"
                  type="number"
                  min={1}
                  max={1440}
                  defaultValue={i?.duration ?? ""}
                />
              </label>
              <label>
                Format
                <select
                  aria-label="Interview format"
                  name="format"
                  defaultValue={i?.format ?? "video"}
                >
                  <option>video</option>
                  <option>phone</option>
                  <option>onsite</option>
                </select>
              </label>
            </div>
            <label>
              Meeting URL
              <input
                name="meetingUrl"
                type="url"
                defaultValue={i?.meetingUrl ?? ""}
              />
            </label>
            <label>
              Location
              <input
                name="location"
                maxLength={300}
                defaultValue={i?.location}
              />
            </label>
            <label>
              Notes
              <textarea
                name="notes"
                maxLength={10000}
                defaultValue={i?.notes}
              />
            </label>
          </>
        )}
        <Feedback error={error} />
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy
              ? "Saving…"
              : "Save " + (isInterview ? "interview" : "reminder")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function ScheduleView() {
  const { data, loading, error, refresh } = useResource<{
    interviews: ScheduledInterview[];
    reminders: ScheduledReminder[];
  }>("/schedule");
  const user = useUser();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LITTLE FORESIGHT</span>
          <h1>
            What’s coming up<span className="green">.</span>
          </h1>
          <p>Interviews and follow-ups, in {user.timezone}.</p>
        </div>
        <Link className="button secondary" href="/applications">
          Go to applications ↗
        </Link>
      </div>
      <ResourceState loading={loading} error={error} retry={refresh} />
      {data && !loading && (
        <div className="two-column">
          <section className="panel">
            <div className="section-heading">
              <h2>Upcoming interviews</h2>
              <span className="count-pill">{data.interviews.length}</span>
            </div>
            {data.interviews.length ? (
              data.interviews.map((i) => (
                <Link
                  className="event-row"
                  key={i.id}
                  href={`/applications/${i.applicationId}`}
                >
                  <div className="event-symbol">◷</div>
                  <div>
                    <strong>{i.title}</strong>
                    <p>
                      {i.application.company} · {i.application.jobTitle}
                    </p>
                    <small>
                      {dateTime(i.startsAt, user.timezone)} · {i.format}
                      {i.duration ? ` · ${i.duration} min` : ""}
                    </small>
                  </div>
                  <span>↗</span>
                </Link>
              ))
            ) : (
              <div className="empty compact">
                No interviews scheduled. Add one from an application.
              </div>
            )}
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>Open reminders</h2>
              <span className="count-pill">{data.reminders.length}</span>
            </div>
            {data.reminders.length ? (
              data.reminders.map((r) => (
                <Link
                  className="reminder-row"
                  key={r.id}
                  href={`/applications/${r.applicationId}`}
                >
                  <span className="check-circle" />
                  <div>
                    <strong>{r.message}</strong>
                    <p>{r.application.company}</p>
                    <small
                      className={
                        new Date(r.dueAt) < new Date() ? "overdue-text" : ""
                      }
                    >
                      {new Date(r.dueAt) < new Date() ? "Overdue · " : ""}
                      {dateTime(r.dueAt, user.timezone)}
                    </small>
                    <small>Email: {r.deliveryStatus}</small>
                  </div>
                </Link>
              ))
            ) : (
              <div className="empty compact">
                All clear. Add a follow-up from an application.
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
