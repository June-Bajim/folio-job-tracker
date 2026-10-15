"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Contact } from "@prisma/client";
import { api, Feedback, useResource, ResourceState } from "../lib/client";
type ContactRecord = Contact & {
  application: { id: string; company: string; jobTitle: string } | null;
};
export function ContactsView({ applicationId }: { applicationId?: string }) {
  const [search, setSearch] = useState("");
  const { data, loading, error, refresh } = useResource<ContactRecord[]>(
    `/contacts?search=${encodeURIComponent(search)}${applicationId ? `&applicationId=${encodeURIComponent(applicationId)}` : ""}`,
  );
  const [editing, setEditing] = useState<ContactRecord | null | undefined>();
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setActionError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const fields = Object.fromEntries(f.entries());
    try {
      await api(
        editing ? `/contacts/${editing.id}` : "/contacts",
        editing ? "PUT" : "POST",
        {
          ...fields,
          email: fields.email || null,
          profileUrl: fields.profileUrl || null,
          applicationId: applicationId ?? editing?.applicationId ?? null,
        },
      );
      setEditing(undefined);
      setSuccess("Contact saved.");
      refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!applicationId && (
        <div className="page-heading">
          <div>
            <span className="eyebrow">PEOPLE BEHIND THE OPPORTUNITIES</span>
            <h1>
              Your contacts<span className="green">.</span>
            </h1>
            <p>
              Recruiters, hiring managers, and conversations worth remembering.
            </p>
          </div>
        </div>
      )}
      <section className="panel feature-panel">
        <div className="section-heading">
          <h2>Contacts</h2>
          <button
            className="text-button"
            onClick={() => {
              setEditing(null);
              setActionError("");
            }}
          >
            ＋ Add contact
          </button>
        </div>
        {!applicationId && (
          <label>
            Search contacts
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, company, or email"
            />
          </label>
        )}
        <Feedback error={actionError} success={success} />
        {editing !== undefined && (
          <form className="inline-editor" onSubmit={save}>
            <h3>{editing ? "Edit contact" : "New contact"}</h3>
            <div className="form-grid">
              <label>
                Name
                <input
                  name="name"
                  required
                  maxLength={200}
                  defaultValue={editing?.name}
                />
              </label>
              <label>
                Company
                <input
                  name="company"
                  maxLength={200}
                  defaultValue={editing?.company}
                />
              </label>
              <label>
                Role / title
                <input
                  name="title"
                  maxLength={200}
                  defaultValue={editing?.title}
                />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  defaultValue={editing?.email ?? ""}
                />
              </label>
              <label>
                Phone
                <input
                  name="phone"
                  type="tel"
                  maxLength={80}
                  defaultValue={editing?.phone}
                />
              </label>
              <label>
                Profile URL
                <input
                  name="profileUrl"
                  type="url"
                  defaultValue={editing?.profileUrl ?? ""}
                />
              </label>
            </div>
            <label>
              Notes and communication log
              <textarea
                name="notes"
                maxLength={10000}
                rows={4}
                defaultValue={editing?.notes}
                placeholder="Contact history, conversation notes, and next steps"
              />
            </label>
            {!applicationId && !editing?.applicationId && (
              <p className="muted">
                Add a contact from an application’s detail page to link them to
                that opportunity.
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(undefined)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save contact"}
              </button>
            </div>
          </form>
        )}
        <ResourceState loading={loading} error={error} retry={refresh} />
        {data &&
          !loading &&
          (data.length ? (
            <div className="contact-grid">
              {data.map((c) => (
                <article className="contact-card" key={c.id}>
                  <h3>{c.name}</h3>
                  <p className="muted">
                    {[c.title, c.company].filter(Boolean).join(" · ")}
                  </p>
                  {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                  {c.phone && <p>{c.phone}</p>}
                  {c.profileUrl && (
                    <a target="_blank" rel="noreferrer" href={c.profileUrl}>
                      Open profile ↗
                    </a>
                  )}
                  {!applicationId && c.application && (
                    <Link href={`/applications/${c.application.id}`}>
                      {c.application.company} · {c.application.jobTitle} ↗
                    </Link>
                  )}
                  {c.notes && <p className="notes">{c.notes}</p>}
                  <div className="small-actions">
                    <button
                      onClick={() => {
                        setEditing(c);
                        setActionError("");
                      }}
                    >
                      Edit contact
                    </button>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (!window.confirm(`Delete ${c.name}?`)) return;
                        setBusy(true);
                        try {
                          await api(`/contacts/${c.id}`, "DELETE");
                          refresh();
                          setSuccess("Contact deleted.");
                        } catch (e) {
                          setActionError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty compact">
              No contacts yet. Keep the people and details close.
            </div>
          ))}
      </section>
    </>
  );
}
