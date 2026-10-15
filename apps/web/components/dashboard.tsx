"use client";
import Link from "next/link";
import type { StatusHistory, Application } from "@prisma/client";
import { statuses } from "../../../packages/shared/schemas";
import {
  useResource,
  useUser,
  ResourceState,
  Badge,
  dateTime,
  type ScheduledInterview,
  type ScheduledReminder,
} from "../lib/client";
type Dashboard = {
  total: number;
  counts: { status: string; _count: number }[];
  interviews: ScheduledInterview[];
  reminders: ScheduledReminder[];
  overdue: ScheduledReminder[];
  activity: (StatusHistory & { application: Application })[];
};
export function DashboardView() {
  const { data, loading, error, refresh } =
    useResource<Dashboard>("/dashboard");
  const user = useUser();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR NEXT CHAPTER</span>
          <h1>
            Let’s keep moving, {user.name.split(" ")[0]}
            <span className="green">.</span>
          </h1>
          <p>A clear view of your search. A little momentum for your day.</p>
        </div>
        <Link className="button primary" href="/applications/new">
          ＋ Add application
        </Link>
      </div>
      <ResourceState loading={loading} error={error} retry={refresh} />
      {data && !loading && (
        <>
          <div className="stats-grid">
            <Link href="/applications" className="stat-card">
              <span>
                Total applications <span>↗</span>
              </span>
              <strong>{data.total}</strong>
              <small>Every opportunity in one place</small>
            </Link>
            {["Applied", "Interviewing", "Offer"].map((s) => (
              <Link
                key={s}
                href={`/applications?status=${s}`}
                className="stat-card"
              >
                <span>
                  {s === "Offer" ? "Offers received" : s}{" "}
                  <span className={`stat-dot ${s.toLowerCase()}`} />
                </span>
                <strong>
                  {data.counts.find((c) => c.status === s)?._count ?? 0}
                </strong>
                <small>
                  {s === "Applied"
                    ? "Out in the world"
                    : s === "Interviewing"
                      ? "Conversations in progress"
                      : "Something to celebrate"}
                </small>
              </Link>
            ))}
          </div>
          <div className="dashboard-grid">
            <section className="panel pipeline">
              <div className="section-heading">
                <div>
                  <h2>Your application pipeline</h2>
                  <p>Every stage is part of the journey.</p>
                </div>
                <Link href="/applications">View all ↗</Link>
              </div>
              <div className="pipeline-bar">
                {statuses.map((s) => {
                  const count =
                    data.counts.find((c) => c.status === s)?._count ?? 0;
                  return count ? (
                    <div
                      key={s}
                      className={s.toLowerCase()}
                      style={{ flex: count }}
                      title={`${s}: ${count}`}
                    />
                  ) : null;
                })}
              </div>
              <div className="pipeline-legend">
                {statuses.map((s) => (
                  <Link href={`/applications?status=${s}`} key={s}>
                    <Badge status={s} />
                    <strong>
                      {data.counts.find((c) => c.status === s)?._count ?? 0}
                    </strong>
                  </Link>
                ))}
              </div>
              {data.total === 0 && (
                <div className="empty compact">
                  Your next opportunity starts with one application.
                  <br />
                  <Link href="/applications/new">
                    Add your first application →
                  </Link>
                </div>
              )}
            </section>
            <section className="panel upcoming">
              <div className="section-heading">
                <h2>Coming up next</h2>
                <Link href="/schedule">Schedule ↗</Link>
              </div>
              {data.interviews.length ? (
                data.interviews.map((i) => (
                  <Link
                    className="event-row"
                    key={i.id}
                    href={`/applications/${i.applicationId}`}
                  >
                    <div className="calendar-tile">
                      <small>
                        {new Intl.DateTimeFormat("en", {
                          month: "short",
                          timeZone: user.timezone,
                        }).format(new Date(i.startsAt))}
                      </small>
                      <strong>
                        {new Intl.DateTimeFormat("en", {
                          day: "numeric",
                          timeZone: user.timezone,
                        }).format(new Date(i.startsAt))}
                      </strong>
                    </div>
                    <div>
                      <strong>{i.title}</strong>
                      <p>
                        {i.application.company} · {i.format}
                      </p>
                      <small>{dateTime(i.startsAt, user.timezone)}</small>
                    </div>
                    <span className="event-arrow">↗</span>
                  </Link>
                ))
              ) : (
                <div className="empty compact">
                  <span className="empty-icon">◷</span>
                  <strong>A little breathing room</strong>
                  <p>Upcoming interviews will appear here.</p>
                </div>
              )}
            </section>
            <section className="panel activity">
              <div className="section-heading">
                <h2>Recent activity</h2>
                <span className="muted">Your progress, at a glance</span>
              </div>
              {data.activity.length ? (
                <div className="timeline">
                  {data.activity.map((a) => (
                    <Link
                      className="activity-row"
                      key={a.id}
                      href={`/applications/${a.applicationId}`}
                    >
                      <span className="timeline-dot" />
                      <div>
                        <strong>{a.application.company}</strong>
                        <p>
                          {a.fromStatus
                            ? `${a.fromStatus} → ${a.toStatus}`
                            : `Added to ${a.toStatus}`}{" "}
                          · {a.application.jobTitle}
                        </p>
                      </div>
                      <small>{dateTime(a.createdAt, user.timezone)}</small>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="empty compact">
                  A fresh page. Add an application to start your story.
                </div>
              )}
            </section>
            <section className="panel followups">
              <div className="section-heading">
                <h2>On your radar</h2>
                <Link href="/schedule">View all ↗</Link>
              </div>
              {[...data.overdue, ...data.reminders].length ? (
                [...data.overdue, ...data.reminders].map((r) => (
                  <Link
                    key={r.id}
                    className="reminder-row"
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
                    </div>
                  </Link>
                ))
              ) : (
                <div className="empty compact">
                  <span className="empty-icon">✓</span>
                  <strong>You’re all caught up</strong>
                  <p>Follow-ups due in the next 7 days appear here.</p>
                </div>
              )}
            </section>
          </div>
          <div className="bottom-note">
            <span>✧</span>
            <p>Progress isn’t always a straight line. Keep showing up.</p>
            <span>ONE STEP AT A TIME</span>
          </div>
        </>
      )}
    </>
  );
}
