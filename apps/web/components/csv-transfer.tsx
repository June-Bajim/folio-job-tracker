"use client";
import { useState } from "react";
import { api, Feedback, downloadFile } from "../lib/client";
type Preview = {
  total: number;
  records: { company: string; jobTitle: string; status: string }[];
  errors: { row: number; message: string }[];
};
export function CsvTransfer({
  onImported,
  onClose,
}: {
  onImported: () => void;
  onClose: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  return (
    <section className="panel feature-panel">
      <div className="section-heading">
        <h2>Import applications from CSV</h2>
        <button className="text-button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="muted">
        Up to 500 rows and 1 MB per file. Required columns: company, jobTitle.
        Dates use YYYY-MM-DD. Nothing is saved until you confirm.
      </p>
      <a
        className="back-link"
        href="/api/applications/import/template"
        download="folio-import-template.csv"
        onClick={async (e) => {
          e.preventDefault();
          setError("");
          try {
            await downloadFile(
              "/applications/import/template",
              "folio-import-template.csv",
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Download blank CSV template ↓
      </a>
      <label>
        Choose CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={async (e) => {
            setPreview(undefined);
            setError("");
            setSuccess("");
            setCsv("");
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 1000000) {
              setError("Choose a CSV file smaller than 1 MB.");
              return;
            }
            setBusy(true);
            try {
              const text = await file.text();
              setCsv(text);
              setPreview(
                await api<Preview>("/applications/import/preview", "POST", {
                  csv: text,
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <Feedback error={error} success={success} />
      {busy && <p role="status">Processing CSV…</p>}
      {preview && (
        <>
          <p>
            {preview.total} application rows · {preview.errors.length} errors
          </p>
          {preview.errors.length ? (
            <ul className="import-errors" role="alert">
              {preview.errors.map((err, i) => (
                <li key={i}>
                  Row {err.row}: {err.message}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Job title</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.records.map((row, i) => (
                      <tr key={i}>
                        <td>{row.company}</td>
                        <td>{row.jobTitle}</td>
                        <td>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted">
                Preview shows the first 10 rows. All {preview.total} will be
                imported together. Reimporting the same data is blocked.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const result = await api<{ imported: number }>(
                      "/applications/import",
                      "POST",
                      { csv },
                    );
                    setSuccess(`Imported ${result.imported} applications.`);
                    setPreview(undefined);
                    setCsv("");
                    onImported();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Confirm import of {preview.total} applications
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
