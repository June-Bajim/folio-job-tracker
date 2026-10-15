import "dotenv/config";
import { Queue } from "bullmq";
export function redisConnection() {
  const u = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: Number(u.pathname.slice(1) || 0),
    ...(u.protocol === "rediss:" ? { tls: {} } : {}),
  };
}
export const reminderQueue = new Queue("folio-reminders", {
  connection: redisConnection(),
  defaultJobOptions: {
    attempts: 8,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  },
});
export const jobId = (id: string, revision: number) =>
  `reminder-${id}-${revision}`;
