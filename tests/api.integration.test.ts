import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import { db } from "../packages/server/db.js";
const app = buildApp();
const suffix = Date.now();
let cookie = "";
let otherCookie = "";
let userId = "";
let otherId = "";
let id = "";
let interviewId = "";
let reminderId = "";
async function request(
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
async function signup(email: string) {
  const r = await request(
    "POST",
    "/auth/sign-up/email",
    { name: "Test User", email, password: "Test-password-2026!" },
    "",
  );
  expect(r.statusCode, r.body).toBe(200);
  return {
    cookie: r.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    id: r.json().user.id as string,
  };
}
beforeAll(async () => {
  await app.ready();
  const a = await signup(`test-${suffix}@example.com`);
  cookie = a.cookie;
  userId = a.id;
  const b = await signup(`other-${suffix}@example.com`);
  otherCookie = b.cookie;
  otherId = b.id;
});
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  await app.close();
  await db.$disconnect();
});
describe("Authenticated API workflows", () => {
  it("protects API endpoints and validates requests", async () => {
    expect(
      (await request("GET", "/applications", undefined, "")).statusCode,
    ).toBe(401);
    expect(
      (
        await request("POST", "/applications", {
          company: "",
          jobTitle: "Engineer",
        })
      ).statusCode,
    ).toBe(400);
  });
  it("creates an application and initial status history", async () => {
    const r = await request("POST", "/applications", {
      company: "Acme",
      jobTitle: "Engineer",
      status: "Applied",
      dateApplied: "2026-10-15",
    });
    expect(r.statusCode, r.body).toBe(201);
    id = r.json().id;
    const detail = await request("GET", `/applications/${id}`);
    expect(detail.json().history[0].toStatus).toBe("Applied");
  });
  it("filters, searches, sorts and paginates only owned records", async () => {
    await request("POST", "/applications", {
      company: "Beta",
      jobTitle: "Designer",
      arrangement: "hybrid",
    });
    const r = await request(
      "GET",
      "/applications?search=eng&status=Applied&arrangement=remote",
    );
    expect(r.json().total).toBe(1);
    expect(r.json().items[0].id).toBe(id);
    const page = await request(
      "GET",
      "/applications?sort=company&pageSize=1&page=2",
    );
    expect(page.json().items[0].company).toBe("Beta");
    expect(
      (await request("GET", "/applications", undefined, otherCookie)).json()
        .total,
    ).toBe(0);
  });
  it("updates fields and creates history only when status changes", async () => {
    const body = {
      company: "Acme",
      jobTitle: "Engineer",
      status: "Interviewing",
      notes: "Remember portfolio",
    };
    expect((await request("PUT", `/applications/${id}`, body)).statusCode).toBe(
      200,
    );
    await request("PUT", `/applications/${id}`, body);
    expect(
      (await request("GET", `/applications/${id}`)).json().history,
    ).toHaveLength(2);
  });
  it("creates and edits interviews and reminders", async () => {
    const i = await request("POST", `/applications/${id}/interviews`, {
      title: "Technical interview",
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      format: "video",
    });
    expect(i.statusCode, i.body).toBe(201);
    interviewId = i.json().id;
    expect(
      (
        await request("PUT", `/applications/${id}/interviews/${interviewId}`, {
          title: "Final interview",
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          format: "phone",
        })
      ).statusCode,
    ).toBe(200);
    const r = await request("POST", `/applications/${id}/reminders`, {
      message: "Follow up",
      dueAt: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(r.statusCode, r.body).toBe(201);
    reminderId = r.json().id;
    expect(
      (
        await request("PUT", `/applications/${id}/reminders/${reminderId}`, {
          message: "Send thanks",
          dueAt: new Date(Date.now() + 7200000).toISOString(),
        })
      ).json().revision,
    ).toBe(2);
    expect((await request("GET", "/schedule")).json().interviews).toHaveLength(
      1,
    );
  });
  it("prevents cross-user access to parent and child mutations", async () => {
    for (const [method, path, body] of [
      ["GET", `/applications/${id}`, undefined],
      ["PUT", `/applications/${id}`, { company: "Hacked", jobTitle: "Hacked" }],
      ["DELETE", `/applications/${id}`, undefined],
      [
        "POST",
        `/applications/${id}/interviews`,
        { title: "Hack", startsAt: new Date().toISOString(), format: "phone" },
      ],
      [
        "PUT",
        `/applications/${id}/interviews/${interviewId}`,
        { title: "Hack", startsAt: new Date().toISOString(), format: "phone" },
      ],
      ["DELETE", `/applications/${id}/interviews/${interviewId}`, undefined],
      [
        "POST",
        `/applications/${id}/reminders`,
        { message: "Hack", dueAt: new Date().toISOString() },
      ],
      [
        "PUT",
        `/applications/${id}/reminders/${reminderId}`,
        { message: "Hack", dueAt: new Date().toISOString() },
      ],
      [
        "POST",
        `/applications/${id}/reminders/${reminderId}/complete`,
        undefined,
      ],
      ["DELETE", `/applications/${id}/reminders/${reminderId}`, undefined],
    ] as const)
      expect(
        (await request(method, path, body, otherCookie)).statusCode,
        `${method} ${path}`,
      ).toBe(404);
  });
  it("keeps completion and cancellation separate from delivery", async () => {
    await request(
      "POST",
      `/applications/${id}/reminders/${reminderId}/complete`,
      {},
    );
    let r = await db.reminder.findUniqueOrThrow({ where: { id: reminderId } });
    expect(r.completedAt).not.toBeNull();
    expect(r.sentAt).toBeNull();
    await request("PUT", `/applications/${id}/reminders/${reminderId}`, {
      message: "Rescheduled",
      dueAt: new Date().toISOString(),
    });
    await request(
      "POST",
      `/applications/${id}/reminders/${reminderId}/cancel`,
      {},
    );
    r = await db.reminder.findUniqueOrThrow({ where: { id: reminderId } });
    expect(r.cancelledAt).not.toBeNull();
  });
  it("calculates a user-scoped dashboard and saves preferences", async () => {
    const r = await request("GET", "/dashboard");
    expect(r.json().total).toBe(2);
    expect(
      (await request("GET", "/dashboard", undefined, otherCookie)).json().total,
    ).toBe(0);
    expect(
      (
        await request("PUT", "/me", {
          name: "Updated",
          timezone: "Africa/Nairobi",
        })
      ).json().timezone,
    ).toBe("Africa/Nairobi");
  });
  it("deletes children and application history consistently", async () => {
    expect(
      (await request("DELETE", `/applications/${id}/interviews/${interviewId}`))
        .statusCode,
    ).toBe(204);
    await request("DELETE", `/applications/${id}`);
    expect(await db.reminder.count({ where: { applicationId: id } })).toBe(0);
    expect(await db.statusHistory.count({ where: { applicationId: id } })).toBe(
      0,
    );
  });
  it("supports logout and password login", async () => {
    await request("POST", "/auth/sign-out", {});
    expect((await request("GET", "/me")).statusCode).toBe(401);
    const r = await request(
      "POST",
      "/auth/sign-in/email",
      { email: `test-${suffix}@example.com`, password: "Test-password-2026!" },
      "",
    );
    expect(r.statusCode, r.body).toBe(200);
  });
});
