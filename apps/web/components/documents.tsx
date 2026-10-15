"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  api,
  Feedback,
  useResource,
  ResourceState,
  dateTime,
  useUser,
  downloadFile,
} from "../lib/client";
import { MAX_DOCUMENT_BYTES } from "../../../packages/shared/schemas";
type Version = {
  id: string;
  number: number;
  label: string;
  filename: string;
  size: number;
  notes: string;
  createdAt: string;
  applications?: {
    applicationId: string;
    application: { company: string; jobTitle: string };
  }[];
};
type DocumentRecord = {
  id: string;
  name: string;
  kind: string;
  versions: Version[];
};
type Submitted = {
  id: string;
  version: Version & { document: { id: string; name: string; kind: string } };
};
export function DocumentsView() {
  const { data, loading, error, refresh } =
    useResource<DocumentRecord[]>("/documents");
  const user = useUser();
  const [uploading, setUploading] = useState<
    DocumentRecord | null | undefined
  >();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setActionError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const file = f.get("file") as File;
      if (!file?.size || file.size > MAX_DOCUMENT_BYTES)
        throw new Error("Choose a PDF or DOCX file between 1 byte and 3 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      await api(
        uploading ? `/documents/${uploading.id}/versions` : "/documents",
        "POST",
        {
          name: uploading?.name ?? f.get("name"),
          kind: uploading?.kind ?? f.get("kind"),
          label: f.get("label"),
          notes: f.get("notes"),
          filename: file.name,
          content: btoa(binary),
        },
      );
      setUploading(undefined);
      refresh();
      setSuccess(
        "Document version saved. Existing submitted versions are unchanged.",
      );
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE RIGHT WORDS, THE RIGHT VERSION</span>
          <h1>
            Your documents<span className="green">.</span>
          </h1>
          <p>
            Keep resumes and cover letters, and track exactly what you
            submitted.
          </p>
        </div>
        <button className="primary" onClick={() => setUploading(null)}>
          ＋ Add document
        </button>
      </div>
      <Feedback error={actionError} success={success} />
      {uploading !== undefined && (
        <section className="panel feature-panel">
          <h2>
            {uploading ? `New version · ${uploading.name}` : "Add a document"}
          </h2>
          <form onSubmit={upload}>
            {!uploading && (
              <div className="form-grid">
                <label>
                  Document name
                  <input name="name" required maxLength={200} />
                </label>
                <label>
                  Document type
                  <select aria-label="Document type" name="kind">
                    <option value="resume">Resume</option>
                    <option value="cover_letter">Cover letter</option>
                  </select>
                </label>
              </div>
            )}
            <label>
              Version label
              <input
                name="label"
                required
                maxLength={100}
                placeholder="e.g. Product roles · October"
              />
            </label>
            <label>
              File (PDF or DOCX, up to 3 MB)
              <input name="file" type="file" accept=".pdf,.docx" required />
            </label>
            <label>
              Version notes
              <textarea name="notes" maxLength={10000} rows={3} />
            </label>
            <p className="muted">
              Versions are immutable. Adding a new version never replaces a file
              already linked to an application. Library limit: 100 MB.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setUploading(undefined)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Uploading…" : "Save document version"}
              </button>
            </div>
          </form>
        </section>
      )}
      <ResourceState loading={loading} error={error} retry={refresh} />
      {data &&
        !loading &&
        (data.length ? (
          <div className="document-grid">
            {data.map((d) => (
              <section className="panel" key={d.id}>
                <div className="section-heading">
                  <div>
                    <h2>{d.name}</h2>
                    <p>
                      {d.kind === "resume" ? "Resume" : "Cover letter"} ·{" "}
                      {d.versions.length} version(s)
                    </p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setUploading(d)}
                  >
                    ＋ New version
                  </button>
                </div>
                {d.versions.map((v) => (
                  <article className="document-version" key={v.id}>
                    <h3>
                      v{v.number} · {v.label}
                    </h3>
                    <p className="muted">
                      {v.filename} · {Math.ceil(v.size / 1024)} KB ·{" "}
                      {dateTime(v.createdAt, user.timezone)}
                    </p>
                    {v.notes && <p className="notes">{v.notes}</p>}
                    <a
                      className="back-link"
                      href={`/api/document-versions/${v.id}/download`}
                      download={v.filename}
                      onClick={async (e) => {
                        e.preventDefault();
                        setActionError("");
                        try {
                          await downloadFile(
                            `/document-versions/${v.id}/content`,
                            v.filename,
                          );
                        } catch (e) {
                          setActionError((e as Error).message);
                        }
                      }}
                    >
                      Download version ↓
                    </a>
                    {v.applications?.map((a) => (
                      <Link
                        className="document-used"
                        key={a.applicationId}
                        href={`/applications/${a.applicationId}`}
                      >
                        Used for {a.application.company} ·{" "}
                        {a.application.jobTitle} ↗
                      </Link>
                    ))}
                  </article>
                ))}
                <button
                  disabled={busy}
                  className="secondary danger"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Delete ${d.name}, every version, and all application links? This cannot be undone.`,
                      )
                    )
                      return;
                    setBusy(true);
                    try {
                      await api(`/documents/${d.id}`, "DELETE");
                      refresh();
                      setSuccess("Document and all its versions deleted.");
                    } catch (e) {
                      setActionError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Delete document and versions
                </button>
              </section>
            ))}
          </div>
        ) : (
          <section className="panel empty">
            <h2>A home for your best work</h2>
            <p>Add your first resume or cover letter.</p>
          </section>
        ))}
    </>
  );
}
export function ApplicationDocuments({
  applicationId,
}: {
  applicationId: string;
}) {
  const library = useResource<DocumentRecord[]>("/documents");
  const links = useResource<Submitted[]>(
    `/applications/${applicationId}/documents`,
  );
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel feature-panel">
      <div className="section-heading">
        <h2>Submitted documents</h2>
        <Link href="/documents">Document library ↗</Link>
      </div>
      <p className="muted">
        Link the exact version you submitted. New uploads won’t change this
        record.
      </p>
      <Feedback error={error || library.error || links.error} />
      <div className="document-link-form">
        <label>
          Choose document version
          <select
            aria-label="Choose document version"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select a saved version</option>
            {library.data?.flatMap((d) =>
              d.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {d.name} · v{v.number} · {v.label}
                </option>
              )),
            )}
          </select>
        </label>
        <button
          className="secondary"
          disabled={!selected || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api(`/applications/${applicationId}/documents`, "POST", {
                versionId: selected,
              });
              links.refresh();
              setSelected("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Link version
        </button>
      </div>
      {links.loading && <p role="status">Loading submitted versions…</p>}
      {links.data?.map((link) => (
        <article className="document-version" key={link.id}>
          <h3>
            {link.version.document.name} · v{link.version.number} ·{" "}
            {link.version.label}
          </h3>
          <a
            className="back-link"
            href={`/api/document-versions/${link.version.id}/download`}
            download={link.version.filename}
            onClick={async (e) => {
              e.preventDefault();
              setError("");
              try {
                await downloadFile(
                  `/document-versions/${link.version.id}/content`,
                  link.version.filename,
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Download submitted file ↓
          </a>
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(
                  `/applications/${applicationId}/documents/${link.id}`,
                  "DELETE",
                );
                links.refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Unlink
          </button>
        </article>
      ))}
      {links.data?.length === 0 && (
        <p className="empty compact">No submitted versions linked yet.</p>
      )}
    </section>
  );
}
