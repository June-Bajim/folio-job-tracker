import "dotenv/config";
import { Worker } from "bullmq";
import {
  redisConnection,
  reminderQueue,
} from "../../../packages/server/queue.js";
import { reconcile, deliver } from "../../../packages/server/reminders.js";
import { db } from "../../../packages/server/db.js";
import { validateConfig } from "../../../packages/server/config.js";
import { randomUUID } from "node:crypto";
import { recordDeliveryFailure } from "../../../packages/server/monitoring.js";
validateConfig();
const worker = new Worker(
  "folio-reminders",
  async (job) => deliver(job.data.id, job.data.revision),
  { connection: redisConnection(), concurrency: 5 },
);
worker.on("error", (error) => console.error("Worker error", error));
worker.on("failed", async (job, error) => {
  if (job)
    await recordDeliveryFailure(
      job.data.id,
      job.data.revision,
      error,
      job.attemptsMade >= (job.opts.attempts ?? 8),
    ).catch(console.error);
});
const workerId = randomUUID();
let running = false;
async function sweep() {
  if (running) return;
  running = true;
  try {
    await db.workerHealth.upsert({
      where: { id: workerId },
      create: { id: workerId },
      update: { lastSeenAt: new Date() },
    });
    await reconcile();
    await db.workerHealth.update({
      where: { id: workerId },
      data: {
        lastSeenAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
      },
    });
    await db.workerHealth.deleteMany({
      where: { lastSeenAt: { lt: new Date(Date.now() - 7 * 86400000) } },
    });
  } catch (error) {
    console.error("Scheduling failed; will retry", error);
    await db.workerHealth
      .updateMany({
        where: { id: workerId },
        data: {
          lastSeenAt: new Date(),
          lastError:
            "Scheduling failed. Check worker logs and database/Redis connectivity.",
          failures: { increment: 1 },
        },
      })
      .catch(console.error);
  } finally {
    running = false;
  }
}
await sweep();
const timer = setInterval(sweep, 5000);
console.info("Reminder worker started; database reconciliation initialized");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(timer);
    await worker.close();
    await db.workerHealth
      .deleteMany({ where: { id: workerId } })
      .catch(console.error);
    await reminderQueue.close();
    await db.$disconnect();
    process.exit(0);
  });
