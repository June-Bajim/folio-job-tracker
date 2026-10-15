import "dotenv/config";
import { Worker } from "bullmq";
import {
  redisConnection,
  reminderQueue,
} from "../../../packages/server/queue.js";
import { reconcile, deliver } from "../../../packages/server/reminders.js";
import { db } from "../../../packages/server/db.js";
import { validateConfig } from "../../../packages/server/config.js";
validateConfig();
const worker = new Worker(
  "folio-reminders",
  async (job) => deliver(job.data.id, job.data.revision),
  { connection: redisConnection(), concurrency: 5 },
);
worker.on("error", (error) => console.error("Worker error", error));
worker.on("failed", async (job, error) => {
  console.error("Reminder delivery failed", job?.id, error.message);
  if (job)
    await db.reminder
      .updateMany({
        where: { id: job.data.id, revision: job.data.revision, sentAt: null },
        data: {
          lastError: error.message,
          ...(job.attemptsMade >= (job.opts.attempts ?? 8)
            ? { deliveryStatus: "failed" }
            : {}),
        },
      })
      .catch(console.error);
});
let running = false;
async function sweep() {
  if (running) return;
  running = true;
  try {
    await reconcile();
  } catch (error) {
    console.error("Scheduling failed; will retry", error);
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
    await reminderQueue.close();
    await db.$disconnect();
    process.exit(0);
  });
