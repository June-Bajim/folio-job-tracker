import type { FastifyInstance } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../../../../packages/server/db.js";
import { workerSummary } from "../../../../packages/server/monitoring.js";
import { owner, routeId, notFound, badRequest } from "./data.js";
export function monitoringRoutes(app: FastifyInstance) {
  app.get("/delivery-status", async (req) => {
    const where = { application: { userId: owner(req) } };
    const [pending, sent, failed, delayed, failures, worker] =
      await Promise.all([
        db.reminder.count({
          where: {
            ...where,
            deliveryStatus: "pending",
            completedAt: null,
            cancelledAt: null,
          },
        }),
        db.reminder.count({ where: { ...where, deliveryStatus: "sent" } }),
        db.reminder.count({
          where: {
            ...where,
            deliveryStatus: "failed",
            completedAt: null,
            cancelledAt: null,
          },
        }),
        db.reminder.count({
          where: {
            ...where,
            deliveryStatus: "pending",
            completedAt: null,
            cancelledAt: null,
            dueAt: { lt: new Date(Date.now() - 300000) },
          },
        }),
        db.reminder.findMany({
          where: {
            ...where,
            OR: [{ deliveryStatus: "failed" }, { lastError: { not: null } }],
            completedAt: null,
            cancelledAt: null,
          },
          include: {
            application: {
              select: { id: true, company: true, jobTitle: true },
            },
            deliveryAttempts: { orderBy: { createdAt: "desc" }, take: 10 },
          },
          orderBy: { dueAt: "asc" },
          take: 100,
        }),
        workerSummary(),
      ]);
    return { pending, sent, failed, delayed, failures, worker };
  });
  app.get("/reminders/:id/attempts", async (req) => {
    if (
      !(await db.reminder.findFirst({
        where: { id: routeId(req), application: { userId: owner(req) } },
      }))
    )
      throw notFound();
    return db.deliveryAttempt.findMany({
      where: { reminderId: routeId(req) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });
  app.post("/reminders/:id/retry", async (req) => {
    z.object({ confirm: z.literal(true) }).parse(req.body);
    return db.$transaction(async (tx) => {
      const id = routeId(req);
      await tx.$executeRaw`SELECT id FROM "Reminder" WHERE id=${id} FOR UPDATE`;
      const reminder = await tx.reminder.findFirst({
        where: { id, application: { userId: owner(req) } },
      });
      if (!reminder) throw notFound();
      if (
        reminder.deliveryStatus !== "failed" ||
        reminder.completedAt ||
        reminder.cancelledAt ||
        reminder.sentAt
      )
        throw badRequest("Only an open, failed reminder can be retried.");
      // Explicit retry is a new revision; never silently retry an uncertain provider acceptance.
      return tx.reminder.update({
        where: { id },
        data: {
          revision: { increment: 1 },
          dueAt: new Date(),
          deliveryStartedAt: null,
          deliveryPayload: Prisma.DbNull,
          deliveryStatus: "pending",
          lastError: null,
          attempts: 0,
          lastAttemptAt: null,
        },
      });
    });
  });
}
export function operationalRoutes(app: FastifyInstance) {
  app.get("/health/worker", async (req, reply) => {
    const expected = process.env.MONITORING_TOKEN;
    const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
    if (
      !expected ||
      !timingSafeEqual(
        createHash("sha256").update(token).digest(),
        createHash("sha256").update(expected).digest(),
      )
    )
      return reply
        .code(401)
        .send({
          error: { code: "UNAUTHORIZED", message: "Monitoring token required" },
        });
    const worker = await workerSummary();
    const failed = await db.reminder.count({
      where: { deliveryStatus: "failed", completedAt: null, cancelledAt: null },
    });
    const delayed = await db.reminder.count({
      where: {
        deliveryStatus: "pending",
        completedAt: null,
        cancelledAt: null,
        dueAt: { lt: new Date(Date.now() - 300000) },
      },
    });
    return reply
      .code(worker.healthy && !failed && !delayed ? 200 : 503)
      .send({
        ok: worker.healthy && !failed && !delayed,
        worker,
        failed,
        delayed,
      });
  });
}
