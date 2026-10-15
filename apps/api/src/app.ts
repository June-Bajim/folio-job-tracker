import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { fromNodeHeaders } from "better-auth/node";
import { Prisma } from "@prisma/client";
import { ZodError, z } from "zod";
import { db } from "../../../packages/server/db.js";
import { auth } from "../../../packages/server/auth.js";
import { serviceOrigin } from "../../../packages/shared/urls.js";
import { dataRoutes } from "./routes/data.js";
import { documentRoutes } from "./routes/documents.js";
import { monitoringRoutes, operationalRoutes } from "./routes/monitoring.js";
import {
  applicationSchema,
  interviewSchema,
  reminderSchema,
  listSchema,
  settingsSchema,
} from "../../../packages/shared/schemas.js";
const missing = () =>
  Object.assign(new Error("Record not found"), { statusCode: 404 });
const params = (v: unknown) =>
  z.object({ id: z.string().min(1), childId: z.string().optional() }).parse(v);
export function buildApp() {
  const app = Fastify({
    logger:
      process.env.NODE_ENV !== "test"
        ? {
            serializers: {
              req: (request) => ({
                method: request.method,
                url: request.url?.split("?")[0],
                remoteAddress: request.ip,
              }),
            },
            redact: ["req.headers.cookie", "req.headers.authorization"],
          }
        : false,
    bodyLimit: 1048576,
  });
  app.register(cors, {
    origin: serviceOrigin(process.env.WEB_URL, "http://localhost:3000"),
    credentials: true,
  });
  app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  app.setNotFoundHandler((_req, reply) =>
    reply
      .code(404)
      .send({ error: { code: "NOT_FOUND", message: "Endpoint not found" } }),
  );
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: {
          code: "VALIDATION",
          message: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(";"),
          issues: error.issues,
        },
      });
    const err = error as { statusCode?: number; message: string };
    const status = err.statusCode ?? 500;
    if (status >= 500) app.log.error(error);
    return reply.code(status).send({
      error: {
        code:
          status === 404
            ? "NOT_FOUND"
            : status === 401
              ? "UNAUTHORIZED"
              : "REQUEST_FAILED",
        message:
          status >= 500
            ? "Something went wrong. Please try again."
            : err.message,
      },
    });
  });
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    handler: async (req, reply) => {
      if (req.url.split("?")[0].replace(/\/+$/, "") === "/api/auth/delete-user")
        z.object({
          password: z.string().min(1).max(128),
          confirmation: z.literal("DELETE"),
        }).parse(req.body);
      const headers = fromNodeHeaders(req.headers);
      const request = new Request(
        new URL(
          req.url,
          serviceOrigin(process.env.BETTER_AUTH_URL, "http://localhost:4000"),
        ),
        {
          method: req.method,
          headers,
          ...(req.method === "POST" ? { body: JSON.stringify(req.body) } : {}),
        },
      );
      const response = await auth.handler(request);
      reply.code(response.status);
      response.headers.forEach((v, k) => {
        if (k !== "set-cookie") reply.header(k, v);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header("set-cookie", cookies);
      return reply.send(await response.text());
    },
  });
  app.get("/health", async () => ({ ok: true }));
  operationalRoutes(app);
  app.register(
    async (protectedApp) => {
      protectedApp.addHook("preHandler", async (req, reply) => {
        reply.header("Cache-Control", "private, no-store");
        if (
          !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
          req.headers.origin &&
          req.headers.origin !==
            serviceOrigin(process.env.WEB_URL, "http://localhost:3000")
        )
          return reply.code(403).send({
            error: { code: "FORBIDDEN", message: "Origin not allowed" },
          });
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(req.headers),
        });
        if (!session)
          return reply.code(401).send({
            error: { code: "UNAUTHORIZED", message: "Please sign in" },
          });
        if (!session.user.emailVerified)
          return reply.code(403).send({
            error: {
              code: "EMAIL_NOT_VERIFIED",
              message: "Verify your email to continue.",
            },
          });
        Object.assign(req, { userId: session.user.id });
      });
      dataRoutes(protectedApp);
      documentRoutes(protectedApp);
      monitoringRoutes(protectedApp);
      const uid = (req: unknown) => (req as { userId: string }).userId;
      protectedApp.get("/me", async (req) =>
        db.user.findUniqueOrThrow({
          where: { id: uid(req) },
          select: {
            id: true,
            name: true,
            email: true,
            timezone: true,
            emailVerified: true,
          },
        }),
      );
      protectedApp.put("/me", async (req) =>
        db.user.update({
          where: { id: uid(req) },
          data: settingsSchema.parse(req.body),
          select: {
            id: true,
            name: true,
            email: true,
            timezone: true,
            emailVerified: true,
          },
        }),
      );
      protectedApp.get("/applications", async (req) => {
        const q = listSchema.parse(req.query);
        const where: Prisma.ApplicationWhereInput = {
          userId: uid(req),
          status: q.status,
          arrangement: q.arrangement,
          ...(q.search
            ? {
                OR: [
                  { company: { contains: q.search, mode: "insensitive" } },
                  { jobTitle: { contains: q.search, mode: "insensitive" } },
                ],
              }
            : {}),
        };
        const now = new Date();
        const [items, total] = await db.$transaction([
          db.application.findMany({
            where,
            orderBy: [
              { [q.sort]: q.sort === "company" ? "asc" : "desc" },
              { id: "asc" },
            ],
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
            include: {
              interviews: {
                where: { startsAt: { gte: now } },
                orderBy: { startsAt: "asc" },
                take: 1,
              },
              reminders: {
                where: { completedAt: null, cancelledAt: null },
                orderBy: { dueAt: "asc" },
                take: 1,
              },
            },
          }),
          db.application.count({ where }),
        ]);
        return { items, total, page: q.page, pageSize: q.pageSize };
      });
      protectedApp.post("/applications", async (req, reply) => {
        const v = applicationSchema.parse(req.body);
        const record = await db.application.create({
          data: {
            ...v,
            dateApplied: v.dateApplied ? new Date(v.dateApplied) : null,
            userId: uid(req),
            history: { create: { toStatus: v.status } },
          },
        });
        return reply.code(201).send(record);
      });
      protectedApp.get("/applications/:id", async (req) => {
        const a = await db.application.findFirst({
          where: { id: params(req.params).id, userId: uid(req) },
          include: {
            history: { orderBy: { createdAt: "desc" } },
            interviews: { orderBy: { startsAt: "asc" } },
            reminders: { orderBy: { dueAt: "asc" } },
          },
        });
        if (!a) throw missing();
        return a;
      });
      protectedApp.put("/applications/:id", async (req) => {
        const v = applicationSchema.parse(req.body);
        const id = params(req.params).id;
        return db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT id FROM "Application" WHERE id=${id} FOR UPDATE`;
          const a = await tx.application.findFirst({
            where: { id, userId: uid(req) },
          });
          if (!a) throw missing();
          return tx.application.update({
            where: { id },
            data: {
              ...v,
              dateApplied: v.dateApplied ? new Date(v.dateApplied) : null,
              ...(v.status !== a.status
                ? {
                    history: {
                      create: { fromStatus: a.status, toStatus: v.status },
                    },
                  }
                : {}),
            },
          });
        });
      });
      protectedApp.delete("/applications/:id", async (req, reply) => {
        const result = await db.application.deleteMany({
          where: { id: params(req.params).id, userId: uid(req) },
        });
        if (!result.count) throw missing();
        return reply.code(204).send();
      });
      for (const kind of ["interviews", "reminders"] as const) {
        protectedApp.post(`/applications/:id/${kind}`, async (req, reply) => {
          const id = params(req.params).id;
          const result = await db.$transaction(async (tx) => {
            const a = await tx.application.findFirst({
              where: { id, userId: uid(req) },
            });
            if (!a) throw missing();
            if (kind === "interviews") {
              const v = interviewSchema.parse(req.body);
              return tx.interview.create({
                data: {
                  ...v,
                  startsAt: new Date(v.startsAt),
                  applicationId: id,
                },
              });
            }
            const v = reminderSchema.parse(req.body);
            return tx.reminder.create({
              data: { ...v, dueAt: new Date(v.dueAt), applicationId: id },
            });
          });
          return reply.code(201).send(result);
        });
        protectedApp.put(`/applications/:id/${kind}/:childId`, async (req) => {
          const { id, childId } = params(req.params);
          if (kind === "interviews") {
            const v = interviewSchema.parse(req.body);
            const result = await db.interview.updateMany({
              where: {
                id: childId,
                applicationId: id,
                application: { userId: uid(req) },
              },
              data: { ...v, startsAt: new Date(v.startsAt) },
            });
            if (!result.count) throw missing();
            return { ok: true };
          }
          const v = reminderSchema.parse(req.body);
          return db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT id FROM "Reminder" WHERE id=${childId} FOR UPDATE`;
            const r = await tx.reminder.findFirst({
              where: {
                id: childId,
                applicationId: id,
                application: { userId: uid(req) },
              },
            });
            if (!r) throw missing();
            return tx.reminder.update({
              where: { id: r.id },
              data: {
                ...v,
                dueAt: new Date(v.dueAt),
                revision: { increment: 1 },
                sentAt: null,
                deliveryStartedAt: null,
                deliveryPayload: Prisma.DbNull,
                deliveryStatus: "pending",
                lastError: null,
                attempts: 0,
                lastAttemptAt: null,
                completedAt: null,
                cancelledAt: null,
              },
            });
          });
        });
        protectedApp.delete(
          `/applications/:id/${kind}/:childId`,
          async (req, reply) => {
            const { id, childId } = params(req.params);
            const where = {
              id: childId,
              applicationId: id,
              application: { userId: uid(req) },
            };
            const result =
              kind === "interviews"
                ? await db.interview.deleteMany({ where })
                : await db.reminder.deleteMany({ where });
            if (!result.count) throw missing();
            return reply.code(204).send();
          },
        );
      }
      protectedApp.post(
        "/applications/:id/reminders/:childId/:action",
        async (req) => {
          const { id, childId } = params(req.params);
          const { action } = z
            .object({ action: z.enum(["complete", "cancel"]) })
            .parse(req.params);
          const result = await db.reminder.updateMany({
            where: {
              id: childId,
              applicationId: id,
              application: { userId: uid(req) },
            },
            data: {
              ...(action === "complete"
                ? { completedAt: new Date() }
                : { cancelledAt: new Date() }),
              revision: { increment: 1 },
            },
          });
          if (!result.count) throw missing();
          return { ok: true };
        },
      );
      protectedApp.get("/schedule", async (req) => {
        const where = { application: { userId: uid(req) } };
        return {
          interviews: await db.interview.findMany({
            where: { ...where, startsAt: { gte: new Date() } },
            include: { application: true },
            orderBy: { startsAt: "asc" },
          }),
          reminders: await db.reminder.findMany({
            where: { ...where, completedAt: null, cancelledAt: null },
            include: { application: true },
            orderBy: { dueAt: "asc" },
          }),
        };
      });
      protectedApp.get("/dashboard", async (req) => {
        const userId = uid(req);
        const now = new Date();
        const soon = new Date(Date.now() + 7 * 86400000);
        const counts = await db.application.groupBy({
          by: ["status"],
          where: { userId },
          _count: true,
          orderBy: { status: "asc" },
        });
        const [interviews, reminders, overdue, activity, deliveryFailures] =
          await db.$transaction([
            db.interview.findMany({
              where: { application: { userId }, startsAt: { gte: now } },
              include: { application: true },
              orderBy: { startsAt: "asc" },
              take: 5,
            }),
            db.reminder.findMany({
              where: {
                application: { userId },
                completedAt: null,
                cancelledAt: null,
                dueAt: { gte: now, lte: soon },
              },
              include: { application: true },
              orderBy: { dueAt: "asc" },
              take: 5,
            }),
            db.reminder.findMany({
              where: {
                application: { userId },
                completedAt: null,
                cancelledAt: null,
                dueAt: { lt: now },
              },
              include: { application: true },
              orderBy: { dueAt: "asc" },
              take: 5,
            }),
            db.statusHistory.findMany({
              where: { application: { userId } },
              include: { application: true },
              orderBy: { createdAt: "desc" },
              take: 8,
            }),
            db.reminder.count({
              where: {
                application: { userId },
                deliveryStatus: "failed",
                completedAt: null,
                cancelledAt: null,
              },
            }),
          ]);
        return {
          total: counts.reduce((sum, c) => sum + c._count, 0),
          counts,
          interviews,
          reminders,
          overdue,
          activity,
          deliveryFailures,
        };
      });
    },
    { prefix: "/api" },
  );
  return app;
}
