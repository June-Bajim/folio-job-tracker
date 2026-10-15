import { db } from "./db.js";
export async function recordDeliveryFailure(
  id: string,
  revision: number,
  error: Error,
  exhausted: boolean,
) {
  // Keep operational details out of customer-facing errors and email addresses out of logs.
  console.error(
    JSON.stringify({
      event: "reminder_delivery_failed",
      reminderId: id,
      revision,
      exhausted,
      error: error.name,
      timestamp: new Date().toISOString(),
    }),
  );
  const message = exhausted
    ? "Email delivery failed after all retries. Review delivery history before retrying."
    : "Temporary email delivery failure. An automatic retry is scheduled.";
  await db.$transaction(async (tx) => {
    const result = await tx.reminder.updateMany({
      where: {
        id,
        revision,
        sentAt: null,
        completedAt: null,
        cancelledAt: null,
      },
      data: {
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        lastError: message,
        ...(exhausted ? { deliveryStatus: "failed" } : {}),
      },
    });
    if (result.count)
      await tx.deliveryAttempt.create({
        data: { reminderId: id, revision, outcome: "failed", error: message },
      });
  });
}
export async function workerSummary() {
  const workers = await db.workerHealth.findMany({
    where: { lastSeenAt: { gte: new Date(Date.now() - 24 * 3600000) } },
    orderBy: { lastSeenAt: "desc" },
    take: 20,
  });
  const cutoff = Date.now() - 120000;
  return {
    healthy: workers.some(
      (w) =>
        w.lastSuccessAt &&
        w.lastSuccessAt.getTime() > cutoff &&
        w.lastSeenAt.getTime() > cutoff &&
        !w.lastError,
    ),
    lastSeenAt: workers[0]?.lastSeenAt ?? null,
    lastSuccessAt: workers.find((w) => w.lastSuccessAt)?.lastSuccessAt ?? null,
  };
}
