import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { buildApp } from "../apps/api/src/app.js";
import { db } from "../packages/server/db.js";
const app = buildApp();
const email = `mail-${randomUUID()}@example.com`;
let userId = "";
let worker: ChildProcess | undefined;
beforeAll(async () => {
  await app.ready();
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: "http://localhost:3000" },
    payload: { name: "Mail test", email, password: "Original-password-2026!" },
  });
  expect(response.statusCode, response.body).toBe(200);
  userId = response.json().user.id;
});
afterAll(async () => {
  worker?.kill();
  await db.user.deleteMany({ where: { id: userId } });
  await app.close();
  await db.$disconnect();
});
async function inbox() {
  const response = await fetch(
    `http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
  );
  expect(response.ok).toBe(true);
  return (await response.json()) as {
    messages: { ID: string; Subject: string }[];
  };
}
it("requires a real email verification link before allowing password login", async () => {
  const blocked = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    headers: { origin: "http://localhost:3000" },
    payload: { email, password: "Original-password-2026!" },
  });
  expect(blocked.statusCode).toBe(403);
  const messages = await inbox();
  const message = messages.messages.find(
    (m) => m.Subject === "Verify your Folio email",
  );
  expect(message).toBeDefined();
  const content = (await (
    await fetch(`http://localhost:8025/api/v1/message/${message!.ID}`)
  ).json()) as { Text: string };
  const url = new URL(content.Text.match(/https?:\/\/\S+/)![0]);
  const verified = await app.inject({
    method: "GET",
    url: url.pathname + url.search,
  });
  expect([200, 302]).toContain(verified.statusCode);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified,
  ).toBe(true);
});
it("sends a recovery email to Mailpit and resets the password", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/request-password-reset",
    headers: { origin: "http://localhost:3000" },
    payload: { email, redirectTo: "http://localhost:3000/reset-password" },
  });
  expect(response.statusCode, response.body).toBe(200);
  const messages = await inbox();
  const message = messages.messages.find(
    (m) => m.Subject === "Reset your Folio password",
  );
  expect(message).toBeDefined();
  const content = (await (
    await fetch(`http://localhost:8025/api/v1/message/${message!.ID}`)
  ).json()) as { Text: string };
  const url = content.Text.match(/https?:\/\/\S+/)?.[0];
  expect(url).toBeDefined();
  const token = new URL(url!).pathname.split("/").pop();
  expect(token).toBeTruthy();
  const reset = await app.inject({
    method: "POST",
    url: "/api/auth/reset-password",
    headers: { origin: "http://localhost:3000" },
    payload: { token, newPassword: "Recovered-password-2026!" },
  });
  expect(reset.statusCode, reset.body).toBe(200);
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    headers: { origin: "http://localhost:3000" },
    payload: { email, password: "Recovered-password-2026!" },
  });
  expect(login.statusCode, login.body).toBe(200);
});
it("separate worker sends an email while no browser is open and survives restart", async () => {
  const a = await db.application.create({
    data: { userId, company: "Mail Test Co", jobTitle: "Engineer" },
  });
  const r = await db.reminder.create({
    data: {
      applicationId: a.id,
      message: "Send a follow-up",
      dueAt: new Date(Date.now() - 1000),
    },
  });
  worker = spawn(
    process.execPath,
    ["--import", "tsx", "apps/worker/src/index.ts"],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "test" },
    },
  );
  let logs = "";
  worker.stdout?.on("data", (c) => {
    logs += c.toString();
  });
  worker.stderr?.on("data", (c) => {
    logs += c.toString();
  });
  await vi.waitFor(
    async () => {
      expect(
        (await db.reminder.findUniqueOrThrow({ where: { id: r.id } }))
          .deliveryStatus,
        logs,
      ).toBe("sent");
    },
    { timeout: 20000, interval: 300 },
  );
  worker.kill();
  worker = undefined;
  const before = (await inbox()).messages.filter(
    (m) => m.Subject === "Follow up · Mail Test Co",
  );
  expect(before).toHaveLength(1);
  worker = spawn(
    process.execPath,
    ["--import", "tsx", "apps/worker/src/index.ts"],
    {
      cwd: process.cwd(),
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "test" },
    },
  );
  let restartLogs = "";
  worker.stdout?.on("data", (c) => {
    restartLogs += c.toString();
  });
  worker.stderr?.on("data", (c) => {
    restartLogs += c.toString();
  });
  // Wait until the restarted process itself has reconciled, rather than checking before startup.
  await vi.waitFor(
    () => expect(restartLogs).toContain("database reconciliation initialized"),
    { timeout: 15000, interval: 100 },
  );
  expect(
    (await inbox()).messages.filter(
      (m) => m.Subject === "Follow up · Mail Test Co",
    ),
  ).toHaveLength(1);
});
