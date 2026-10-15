"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { CsvTransfer } from "./csv-transfer";
import { useSearchParams, useRouter } from "next/navigation";
import { statuses, arrangements } from "../../../packages/shared/schemas";
import {
  downloadFile,
  Feedback,
  useResource,
  useUser,
  ResourceState,
  Badge,
  dateOnly,
  dateTime,
  type AppRecord,
} from "../lib/client";
export function ApplicationList() {
  const search = useSearchParams();
  const router = useRouter();
  const user = useUser();
  const [transferError, setTransferError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [searchText, setSearchText] = useState(search.get("search") ?? "");
  const searchInput = useRef<HTMLInputElement>(null);
  const urlSearch = search.get("search") ?? "";
  useEffect(() => {
    // Keep browser navigation in sync without replacing text still being typed.
    if (searchInput.current !== document.activeElement)
      setSearchText(urlSearch);
  }, [urlSearch]);
  const { data, loading, error, refresh } = useResource<{
    items: AppRecord[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/applications?${search.toString()}`);
  function change(key: string, value: string) {
    const q = new URLSearchParams(search.toString());
    if (key !== "search") {
      if (searchText) q.set("search", searchText);
      else q.delete("search");
    }
    if (value) q.set(key, value);
    else q.delete(key);
    if (key !== "page") q.delete("page");
    router.replace(`/applications?${q.toString()}`);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">POSSIBILITIES, ORGANIZED</span>
          <h1>
            Your applications<span className="green">.</span>
          </h1>
          <p>Keep the details close and the next step clear.</p>
        </div>
        <div className="button-group">
          <a
            className="button secondary"
            href="/api/applications/export"
            download="folio-applications.csv"
            onClick={async (e) => {
              e.preventDefault();
              setTransferError("");
              try {
                await downloadFile(
                  "/applications/export",
                  "folio-applications.csv",
                );
              } catch (e) {
                setTransferError((e as Error).message);
              }
            }}
          >
            Export CSV ↓
          </a>
          <button
            className="secondary"
            onClick={() => setShowImport((v) => !v)}
          >
            Import CSV
          </button>
          <Link className="button primary" href="/applications/new">
            ＋ Add application
          </Link>
        </div>
      </div>
      {showImport && (
        <CsvTransfer
          onImported={refresh}
          onClose={() => setShowImport(false)}
        />
      )}
      <Feedback error={transferError} />
      <section className="panel list-panel">
        <div className="filters">
          <label className="search-field">
            <span className="sr-only">Search applications</span>
            <input
              placeholder="Search company or role…"
              ref={searchInput}
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                change("search", e.target.value);
              }}
            />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select
              aria-label="Filter by status"
              value={search.get("status") ?? ""}
              onChange={(e) => change("status", e.target.value)}
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Work arrangement filter</span>
            <select
              aria-label="Work arrangement filter"
              value={search.get("arrangement") ?? ""}
              onChange={(e) => change("arrangement", e.target.value)}
            >
              <option value="">All arrangements</option>
              {arrangements.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Sort applications</span>
            <select
              aria-label="Sort applications"
              value={search.get("sort") ?? "createdAt"}
              onChange={(e) => change("sort", e.target.value)}
            >
              <option value="createdAt">Newest first</option>
              <option value="dateApplied">Date applied</option>
              <option value="company">Company A–Z</option>
            </select>
          </label>
        </div>
        <ResourceState loading={loading} error={error} retry={refresh} />
        {data && !loading && (
          <>
            {data.items.length ? (
              <div className="table-scroll">
                <p className="table-hint">
                  Scroll horizontally for all details →
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>COMPANY & ROLE</th>
                      <th>STATUS</th>
                      <th>WORK STYLE</th>
                      <th>DATE APPLIED</th>
                      <th>NEXT ACTION</th>
                      <th>
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((a) => {
                      const i = a.interviews[0],
                        r = a.reminders[0];
                      const next =
                        i && (!r || new Date(i.startsAt) < new Date(r.dueAt))
                          ? { text: i.title, date: i.startsAt }
                          : r
                            ? { text: r.message, date: r.dueAt }
                            : null;
                      return (
                        <tr key={a.id}>
                          <td>
                            <Link
                              className="company-cell"
                              href={`/applications/${a.id}`}
                            >
                              <span className="company-avatar">
                                {a.company.slice(0, 1).toUpperCase()}
                              </span>
                              <span>
                                <strong>{a.company}</strong>
                                <small>{a.jobTitle}</small>
                              </span>
                            </Link>
                          </td>
                          <td>
                            <Badge status={a.status} />
                          </td>
                          <td className="capitalize">{a.arrangement}</td>
                          <td>{dateOnly(a.dateApplied)}</td>
                          <td>
                            {next ? (
                              <>
                                <strong className="next-label">
                                  {next.text}
                                </strong>
                                <small>
                                  {dateTime(next.date, user.timezone)}
                                </small>
                              </>
                            ) : (
                              <span className="muted">No action scheduled</span>
                            )}
                          </td>
                          <td>
                            <Link
                              aria-label={`Open ${a.company}`}
                              href={`/applications/${a.id}`}
                            >
                              ↗
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <span className="empty-icon">▤</span>
                <h2>
                  {data.total === 0 && !search.toString()
                    ? "A world of possibilities"
                    : "No applications found"}
                </h2>
                <p>Try adjusting your filters, or add your next opportunity.</p>
                <Link className="button primary" href="/applications/new">
                  Add application
                </Link>
              </div>
            )}
            <div className="pagination">
              <span>
                {data.total} application{data.total !== 1 ? "s" : ""} · Page{" "}
                {data.page} of{" "}
                {Math.max(1, Math.ceil(data.total / data.pageSize))}
              </span>
              <div>
                <button
                  className="secondary"
                  disabled={data.page <= 1}
                  onClick={() => change("page", String(data.page - 1))}
                >
                  ← Previous
                </button>
                <button
                  className="secondary"
                  disabled={data.page * data.pageSize >= data.total}
                  onClick={() => change("page", String(data.page + 1))}
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
