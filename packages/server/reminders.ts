import { db } from "./db.js";
import { reminderQueue, jobId } from "./queue.js";
import { sendEmail } from "./email.js";
import { z } from "zod";
const payloadSchema = z.object({
  to: z.string(),
  subject: z.string(),
  text: z.string(),
});
export async function reconcile() {
  // Only schedule a rolling horizon; database retains all future reminders.
  const rows = await db.reminder.findMany({
    where: {
      completedAt: null,
      cancelledAt: null,
      deliveryStatus: "pending",
      dueAt: { lte: new Date(Date.now() + 86400000) },
    },
    take: 1000,
    orderBy: { dueAt: "asc" },
  });
  for (const r of rows) {
    const existing = await reminderQueue.getJob(jobId(r.id, r.revision));
    if (existing && (await existing.getState()) === "failed") {
      await db.reminder.updateMany({
        where: { id: r.id, revision: r.revision, deliveryStatus: "pending" },
        data: {
          deliveryStatus: "failed",
          lastError: existing.failedReason || "Delivery exhausted retries",
        },
      });
      continue;
    }
    await reminderQueue.add(
      "deliver",
      { id: r.id, revision: r.revision },
      {
        jobId: jobId(r.id, r.revision),
        delay: Math.max(0, r.dueAt.getTime() - Date.now()),
      },
    );
  }
  // Remove obsolete jobs promptly; active jobs independently re-check the database.
  const queued = await reminderQueue.getJobs(["delayed", "waiting"], 0, 999);
  for (const job of queued) {
    const r = await db.reminder.findUnique({ where: { id: job.data.id } });
    if (
      !r ||
      r.revision !== job.data.revision ||
      r.completedAt ||
      r.cancelledAt ||
      r.sentAt ||
      r.deliveryStatus !== "pending"
    )
      await job.remove().catch(() => {});
  }
}
export async function deliver(id: string, revision: number, email = sendEmail) {
  // Freeze recipient and body so provider idempotency replays remain byte-for-byte stable.
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Reminder" WHERE id=${id} FOR UPDATE`;
    const r = await tx.reminder.findUnique({
      where: { id },
      include: { application: { include: { user: true } } },
    });
    if (
      !r ||
      r.revision !== revision ||
      r.deliveryStartedAt ||
      r.completedAt ||
      r.cancelledAt ||
      r.sentAt ||
      r.deliveryStatus !== "pending" ||
      r.dueAt.getTime() > Date.now()
    )
      return;
    await tx.reminder.update({
      where: { id },
      data: {
        deliveryStartedAt: new Date(),
        deliveryPayload: {
          to: r.application.user.email,
          subject: `Follow up · ${r.application.company}`,
          text: `${r.message}\n\n${r.application.jobTitle} at ${r.application.company}\n${process.env.WEB_URL}/applications/${r.applicationId}`,
        },
      },
    });
  });
  // Row lock serializes edits/cancellation/deletion with delivery, including multiple workers.
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Reminder" WHERE id=${id} FOR UPDATE`;
      const r = await tx.reminder.findUnique({
        where: { id },
        include: { application: { include: { user: true } } },
      });
      if (
        !r ||
        r.revision !== revision ||
        r.completedAt ||
        r.cancelledAt ||
        r.sentAt ||
        r.deliveryStatus !== "pending" ||
        r.dueAt.getTime() > Date.now()
      )
        return;
      if (
        r.deliveryStartedAt &&
        Date.now() - r.deliveryStartedAt.getTime() > 23 * 3600000
      ) {
        await tx.reminder.update({
          where: { id },
          data: {
            deliveryStatus: "failed",
            lastError:
              "Delivery could not be confirmed within the provider deduplication window. Check provider logs before rescheduling.",
          },
        });
        return;
      }
      const payload = payloadSchema.parse(r.deliveryPayload);
      await email(
        payload.to,
        payload.subject,
        payload.text,
        jobId(id, revision),
      );
      await tx.reminder.update({
        where: { id },
        data: { sentAt: new Date(), deliveryStatus: "sent", lastError: null },
      });
    },
    { timeout: 25000, maxWait: 30000 },
  );
}
