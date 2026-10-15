import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Worker } from "bullmq";
import { randomUUID } from "node:crypto";
import { db } from "../packages/server/db.js";
import { reconcile, deliver } from "../packages/server/reminders.js";
import {
  reminderQueue,
  redisConnection,
  jobId,
} from "../packages/server/queue.js";
const userId = randomUUID();
let applicationId = "";
let worker: Worker | undefined;
const due = () => new Date(Date.now() - 1000);
async function reminder(extra: Record<string, unknown> = {}) {
  return db.reminder.create({
    data: { applicationId, message: "Follow up", dueAt: due(), ...extra },
  });
}
beforeAll(async () => {
  await db.user.create({
    data: {
      id: userId,
      name: "Worker test",
      email: `worker-${userId}@example.com`,
    },
  });
  applicationId = (
    await db.application.create({
      data: { userId, company: "Worker Co", jobTitle: "Engineer" },
    })
  ).id;
});
afterAll(async () => {
  await worker?.close();
  const rows = await db.reminder.findMany({ where: { applicationId } });
  for (const r of rows) {
    const j = await reminderQueue.getJob(jobId(r.id, r.revision));
    await j?.remove().catch(() => {});
  }
  await db.user.delete({ where: { id: userId } });
  await reminderQueue.close();
  await db.$disconnect();
});
describe("Durable reminder delivery", () => {
  it("persists delayed jobs and schedules new revisions", async () => {
    const r = await reminder({ dueAt: new Date(Date.now() + 600000) });
    await reconcile();
    expect(await reminderQueue.getJob(jobId(r.id, 1))).toBeDefined();
    await db.reminder.update({
      where: { id: r.id },
      data: {
        revision: { increment: 1 },
        dueAt: new Date(Date.now() + 1200000),
      },
    });
    await reconcile();
    expect(await reminderQueue.getJob(jobId(r.id, 2))).toBeDefined();
    const email = vi.fn();
    await deliver(r.id, 1, email);
    expect(email).not.toHaveBeenCalled();
  });
  it("serializes concurrent delivery and suppresses completed jobs", async () => {
    const r = await reminder();
    const email = vi.fn().mockResolvedValue(undefined);
    await Promise.all([deliver(r.id, 1, email), deliver(r.id, 1, email)]);
    expect(email).toHaveBeenCalledTimes(1);
    await deliver(r.id, 1, email);
    expect(email).toHaveBeenCalledTimes(1);
    const row = await db.reminder.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.sentAt).not.toBeNull();
    expect(row.completedAt).toBeNull();
  });
  it("skips cancelled, completed, deleted and rescheduled jobs", async () => {
    const email = vi.fn();
    for (const extra of [
      { cancelledAt: new Date() },
      { completedAt: new Date() },
      { revision: 2 },
      { dueAt: new Date(Date.now() + 10000) },
    ]) {
      const r = await reminder(extra);
      await deliver(r.id, 1, email);
    }
    const deleted = await reminder();
    await db.reminder.delete({ where: { id: deleted.id } });
    await deliver(deleted.id, 1, email);
    expect(email).not.toHaveBeenCalled();
  });
  it("retries transient delivery failures with the same idempotency key", async () => {
    const r = await reminder();
    const email = vi
      .fn()
      .mockRejectedValueOnce(new Error("Temporary mail outage"))
      .mockResolvedValue(undefined);
    await expect(deliver(r.id, 1, email)).rejects.toThrow(
      "Temporary mail outage",
    );
    expect(
      (await db.reminder.findUniqueOrThrow({ where: { id: r.id } })).sentAt,
    ).toBeNull();
    await deliver(r.id, 1, email);
    expect(email).toHaveBeenCalledTimes(2);
    expect(email.mock.calls[0][3]).toBe(email.mock.calls[1][3]);
  });
  it("keeps the original recipient and body stable if application details change between retries", async () => {
    const r = await reminder();
    const email = vi
      .fn()
      .mockRejectedValueOnce(new Error("Temporary outage"))
      .mockResolvedValue(undefined);
    await expect(deliver(r.id, 1, email)).rejects.toThrow();
    await db.application.update({
      where: { id: applicationId },
      data: { company: "Updated company" },
    });
    await deliver(r.id, 1, email);
    expect(email.mock.calls[0]).toEqual(email.mock.calls[1]);
  });
  it("removes stale scheduled deliveries after cancellation and deletion", async () => {
    const r = await reminder({ dueAt: new Date(Date.now() + 600000) });
    await reconcile();
    expect(await reminderQueue.getJob(jobId(r.id, 1))).toBeDefined();
    await db.reminder.update({
      where: { id: r.id },
      data: { cancelledAt: new Date(), revision: { increment: 1 } },
    });
    await reconcile();
    expect(await reminderQueue.getJob(jobId(r.id, 1))).toBeUndefined();
    const deleted = await reminder({ dueAt: new Date(Date.now() + 600000) });
    await reconcile();
    await db.reminder.delete({ where: { id: deleted.id } });
    await reconcile();
    expect(await reminderQueue.getJob(jobId(deleted.id, 1))).toBeUndefined();
  });
  it("stops ambiguous deliveries before provider idempotency expires", async () => {
    const r = await reminder({
      deliveryStartedAt: new Date(Date.now() - 24 * 3600000),
    });
    const email = vi.fn();
    await deliver(r.id, 1, email);
    expect(email).not.toHaveBeenCalled();
    expect(
      (await db.reminder.findUniqueOrThrow({ where: { id: r.id } }))
        .deliveryStatus,
    ).toBe("failed");
  });
  it("recovers database scheduling after a missing Redis job and retries in BullMQ", async () => {
    const r = await reminder();
    await reconcile();
    const queued = await reminderQueue.getJob(jobId(r.id, 1));
    await queued?.remove();
    await reconcile();
    expect(await reminderQueue.getJob(jobId(r.id, 1))).toBeDefined();
    let attempts = 0;
    const mail = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new Error("Temporary outage");
    });
    worker = new Worker(
      "folio-reminders",
      async (job) => {
        if (job.data.id === r.id)
          await deliver(job.data.id, job.data.revision, mail);
        else await deliver(job.data.id, job.data.revision, async () => {});
      },
      { connection: redisConnection() },
    );
    await vi.waitFor(
      async () => {
        expect(
          (await db.reminder.findUniqueOrThrow({ where: { id: r.id } })).sentAt,
        ).not.toBeNull();
      },
      { timeout: 15000, interval: 200 },
    );
    expect(mail).toHaveBeenCalledTimes(2);
    await worker.close();
    worker = undefined;
  });
});
