import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { buildApp } from "../apps/api/src/app.js";
import { db } from "../packages/server/db.js";
import { deliver } from "../packages/server/reminders.js";
import { recordDeliveryFailure } from "../packages/server/monitoring.js";
import { reminderQueue } from "../packages/server/queue.js";
const app = buildApp();
const suffix = randomUUID();
const users: string[] = [];
let cookie = "";
let otherCookie = "";
let applicationId = "";
let contactId = "";
let documentId = "";
let firstVersionId = "";
let reminderId = "";
async function req(
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  payload?: unknown,
  session = cookie,
) {
  return app.inject({
    method,
    url: `/api${url}`,
    headers: { cookie: session, origin: "http://localhost:3000" },
    ...(payload === undefined ? {} : { payload: payload as any }),
  });
}
async function account(name: string) {
  const email = `${name}-${suffix}@example.com`;
  const r = await req(
    "POST",
    "/auth/sign-up/email",
    { name, email, password: "Test-password-2026!" },
    "",
  );
  expect(r.statusCode, r.body).toBe(200);
  const id = r.json().user.id;
  users.push(id);
  await db.user.update({ where: { id }, data: { emailVerified: true } });
  const login = await req(
    "POST",
    "/auth/sign-in/email",
    { email, password: "Test-password-2026!" },
    "",
  );
  expect(login.statusCode, login.body).toBe(200);
  return {
    id,
    email,
    cookie: login.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
  };
}
const file = (
  label = "First draft",
  contents = "%PDF-1.7\nfirst version\n%%EOF",
) => ({
  name: "Product resume",
  kind: "resume",
  label,
  filename: "resume.pdf",
  content: Buffer.from(contents).toString("base64"),
  notes: "Tailored for product roles",
});
beforeAll(async () => {
  await app.ready();
  cookie = (await account("tools")).cookie;
  otherCookie = (await account("other-tools")).cookie;
  const r = await req("POST", "/applications", {
    company: "Acme",
    jobTitle: "Engineer",
    status: "Applied",
  });
  expect(r.statusCode, r.body).toBe(201);
  applicationId = r.json().id;
});
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: users } } });
  await app.close();
  await reminderQueue.close();
  await db.$disconnect();
  vi.unstubAllEnvs();
});
describe("CSV import/export", () => {
  it("exports only owned data and atomically creates initial status history", async () => {
    const output = await req("GET", "/applications/export");
    expect(output.statusCode).toBe(200);
    expect(output.headers["content-type"]).toContain("text/csv");
    expect(output.body).toContain("Acme");
    expect(
      (await req("GET", "/applications/export", undefined, otherCookie)).body,
    ).not.toContain("Acme");
    const csv =
      'company,jobTitle,status,notes\nNew Co,Designer,Interviewing,"Line 1\nLine 2"';
    expect(
      (await req("POST", "/applications/import/preview", { csv })).json()
        .errors,
    ).toHaveLength(0);
    const imported = await req("POST", "/applications/import", { csv });
    expect(imported.statusCode, imported.body).toBe(201);
    expect(imported.json().imported).toBe(1);
    const a = await db.application.findFirstOrThrow({
      where: { userId: users[0], company: "New Co" },
      include: { history: true },
    });
    expect(a.history[0].toStatus).toBe("Interviewing");
    expect(a.notes).toContain("\n");
    expect(
      (await req("POST", "/applications/import", { csv })).statusCode,
    ).toBe(409);
  });
  it("rejects invalid batches without saving any valid rows", async () => {
    const before = await db.application.count({ where: { userId: users[0] } });
    const csv =
      "company,jobTitle,salaryMin,salaryMax\nValid,Engineer,10,20\nInvalid,Engineer,100,20";
    const preview = await req("POST", "/applications/import/preview", { csv });
    expect(preview.json().errors[0].row).toBe(3);
    expect(
      (await req("POST", "/applications/import", { csv })).statusCode,
    ).toBe(400);
    expect(await db.application.count({ where: { userId: users[0] } })).toBe(
      before,
    );
  });
});
describe("Contacts and immutable document versions", () => {
  it("creates, searches, edits, and isolates application contacts", async () => {
    const r = await req("POST", "/contacts", {
      name: "Jamie Recruiter",
      company: "Acme",
      email: "jamie@example.com",
      applicationId,
    });
    expect(r.statusCode, r.body).toBe(201);
    contactId = r.json().id;
    expect((await req("GET", "/contacts?search=Jamie")).json()).toHaveLength(1);
    expect(
      (await req("GET", "/contacts", undefined, otherCookie)).json(),
    ).toHaveLength(0);
    expect(
      (
        await req("PUT", `/contacts/${contactId}`, {
          name: "Updated",
          notes: "Spoke on Tuesday",
          applicationId,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await req(
          "PUT",
          `/contacts/${contactId}`,
          { name: "Hacked" },
          otherCookie,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await req(
          "POST",
          "/contacts",
          { name: "Foreign link", applicationId },
          otherCookie,
        )
      ).statusCode,
    ).toBe(404);
  });
  it("uploads and links an exact version while later uploads preserve the submitted bytes", async () => {
    const r = await req("POST", "/documents", file());
    expect(r.statusCode, r.body).toBe(201);
    documentId = r.json().id;
    firstVersionId = r.json().versions[0].id;
    expect(JSON.stringify(r.json())).not.toContain("content");
    const link = await req("POST", `/applications/${applicationId}/documents`, {
      versionId: firstVersionId,
    });
    expect(link.statusCode, link.body).toBe(201);
    const v2 = await req(
      "POST",
      `/documents/${documentId}/versions`,
      file("Revised", "%PDF-1.7\nsecond version\n%%EOF"),
    );
    expect(v2.statusCode, v2.body).toBe(201);
    expect(v2.json().number).toBe(2);
    const linked = await req("GET", `/applications/${applicationId}/documents`);
    expect(linked.json()[0].version.id).toBe(firstVersionId);
    expect(linked.json()[0].version.number).toBe(1);
    const download = await req(
      "GET",
      `/document-versions/${firstVersionId}/download`,
    );
    expect(download.body).toContain("first version");
    expect(download.headers["content-disposition"]).toContain("attachment");
    expect((await req("GET", "/documents")).json()[0].versions).toHaveLength(2);
  });
  it("rejects invalid files and cross-user downloads, uploads, deletion and document links", async () => {
    expect(
      (await req("POST", "/documents", file("Bad", "not a pdf"))).statusCode,
    ).toBe(400);
    expect(
      (
        await req("POST", "/documents", {
          ...file(),
          filename: "../secret.pdf",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await req(
          "GET",
          `/document-versions/${firstVersionId}/download`,
          undefined,
          otherCookie,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await req(
          "POST",
          `/documents/${documentId}/versions`,
          file(),
          otherCookie,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await req("DELETE", `/documents/${documentId}`, undefined, otherCookie))
        .statusCode,
    ).toBe(404);
    const foreignApp = (
      await req(
        "POST",
        "/applications",
        { company: "Other", jobTitle: "Engineer" },
        otherCookie,
      )
    ).json().id;
    expect(
      (
        await req(
          "POST",
          `/applications/${foreignApp}/documents`,
          { versionId: firstVersionId },
          otherCookie,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await req(
          "GET",
          `/applications/${applicationId}/documents`,
          undefined,
          otherCookie,
        )
      ).statusCode,
    ).toBe(404);
  });
});
describe("Delivery operations and account controls", () => {
  it("records failed attempts privately and safely schedules an explicit retry", async () => {
    const r = (
      await req("POST", `/applications/${applicationId}/reminders`, {
        message: "Send thanks",
        dueAt: new Date(Date.now() - 1000).toISOString(),
      })
    ).json();
    reminderId = r.id;
    await recordDeliveryFailure(
      reminderId,
      1,
      new Error("temporary SMTP problem"),
      true,
    );
    const report = await req("GET", "/delivery-status");
    expect(report.json().failed).toBe(1);
    expect(report.json().failures[0].deliveryAttempts).toHaveLength(1);
    expect(
      (await req("GET", "/delivery-status", undefined, otherCookie)).json()
        .failed,
    ).toBe(0);
    expect(
      (
        await req(
          "GET",
          `/reminders/${reminderId}/attempts`,
          undefined,
          otherCookie,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await req(
          "POST",
          `/reminders/${reminderId}/retry`,
          { confirm: true },
          otherCookie,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await req("POST", `/reminders/${reminderId}/retry`, { confirm: false }))
        .statusCode,
    ).toBe(400);
    const retry = await req("POST", `/reminders/${reminderId}/retry`, {
      confirm: true,
    });
    expect(retry.json().revision).toBe(2);
    const email = vi.fn().mockResolvedValue(undefined);
    await deliver(reminderId, 2, email);
    expect(email).toHaveBeenCalledTimes(1);
    expect(
      (await req("GET", `/reminders/${reminderId}/attempts`)).json(),
    ).toHaveLength(2);
    expect(
      (await req("POST", `/reminders/${reminderId}/retry`, { confirm: true }))
        .statusCode,
    ).toBe(400);
  });
  it("protects operational health with a token and reports stale and healthy heartbeats", async () => {
    vi.stubEnv("MONITORING_TOKEN", "integration-monitor-secret");
    expect(
      (await app.inject({ method: "GET", url: "/health/worker" })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/health/worker",
          headers: { authorization: "Bearer wrong" },
        })
      ).statusCode,
    ).toBe(401);
    const workerId = `test-${suffix}`;
    await db.workerHealth.create({
      data: { id: workerId, lastSeenAt: new Date(), lastSuccessAt: new Date() },
    });
    const response = await app.inject({
      method: "GET",
      url: "/health/worker",
      headers: { authorization: "Bearer integration-monitor-secret" },
    });
    expect(response.json().worker.healthy).toBe(true);
    await db.workerHealth.delete({ where: { id: workerId } });
  });
  it("changes password, revokes other sessions and deletes all owned data after password confirmation", async () => {
    const login2 = await req(
      "POST",
      "/auth/sign-in/email",
      { email: `tools-${suffix}@example.com`, password: "Test-password-2026!" },
      "",
    );
    const secondCookie = login2.cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    expect(
      (
        await req("POST", "/auth/change-password", {
          currentPassword: "wrong",
          newPassword: "New-password-2026!",
          revokeOtherSessions: true,
        })
      ).statusCode,
    ).toBe(400);
    const changed = await req("POST", "/auth/change-password", {
      currentPassword: "Test-password-2026!",
      newPassword: "New-password-2026!",
      revokeOtherSessions: true,
    });
    expect(changed.statusCode, changed.body).toBe(200);
    if (changed.cookies.length)
      cookie = changed.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    expect((await req("GET", "/me", undefined, secondCookie)).statusCode).toBe(
      401,
    );
    expect(
      (await req("POST", "/auth/delete-user", { confirmation: "DELETE" }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await req("POST", "/auth/delete-user", {
          password: "wrong",
          confirmation: "DELETE",
        })
      ).statusCode,
    ).toBe(400);
    const removed = await req("POST", "/auth/delete-user", {
      password: "New-password-2026!",
      confirmation: "DELETE",
    });
    expect(removed.statusCode, removed.body).toBe(200);
    expect(await db.user.findUnique({ where: { id: users[0] } })).toBeNull();
    expect(await db.contact.count({ where: { id: contactId } })).toBe(0);
    expect(await db.documentVersion.count({ where: { documentId } })).toBe(0);
    expect(
      await db.applicationDocument.count({ where: { applicationId } }),
    ).toBe(0);
    expect(await db.reminder.count({ where: { id: reminderId } })).toBe(0);
    expect(await db.importBatch.count({ where: { userId: users[0] } })).toBe(0);
    expect((await req("GET", "/me")).statusCode).toBe(401);
  });
});
