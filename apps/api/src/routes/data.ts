import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../../../../packages/server/db.js";
import { exportCsv, previewCsv } from "../../../../packages/server/csv.js";
import { contactSchema } from "../../../../packages/shared/schemas.js";
export const owner = (req: FastifyRequest) =>
  (req as FastifyRequest & { userId: string }).userId;
export const routeId = (req: FastifyRequest) =>
  z.object({ id: z.string().min(1) }).parse(req.params).id;
export const notFound = () =>
  Object.assign(new Error("Record not found"), { statusCode: 404 });
export const badRequest = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
export function dataRoutes(app: FastifyInstance) {
  app.get("/applications/export", async (req, reply) => {
    const rows = await db.application.findMany({
      where: { userId: owner(req) },
      orderBy: { createdAt: "asc" },
    });
    const csv = exportCsv(
      rows.map((row) => ({
        ...row,
        dateApplied: row.dateApplied?.toISOString().slice(0, 10) ?? "",
      })),
    );
    if ((req.query as { format?: string }).format === "json")
      return reply
        .header("Cache-Control", "private, no-store")
        .send({
          filename: "folio-applications.csv",
          mimeType: "text/csv;charset=utf-8",
          content: Buffer.from(csv).toString("base64"),
        });
    return reply
      .header(
        "Content-Disposition",
        'attachment; filename="folio-applications.csv"',
      )
      .type("text/csv; charset=utf-8")
      .send(csv);
  });
  app.get("/applications/import/template", async (req, reply) => {
    if ((req.query as { format?: string }).format === "json")
      return reply
        .header("Cache-Control", "private, no-store")
        .send({
          filename: "folio-import-template.csv",
          mimeType: "text/csv;charset=utf-8",
          content: Buffer.from(exportCsv([])).toString("base64"),
        });
    return reply
      .header(
        "Content-Disposition",
        'attachment; filename="folio-import-template.csv"',
      )
      .type("text/csv; charset=utf-8")
      .send(exportCsv([]));
  });
  const input = (body: unknown) =>
    z.object({ csv: z.string().min(1).max(1000000) }).parse(body).csv;
  app.post(
    "/applications/import/preview",
    { bodyLimit: 2 * 1024 * 1024 },
    async (req) => {
      const preview = previewCsv(input(req.body));
      return { ...preview, records: preview.records.slice(0, 10) };
    },
  );
  app.post(
    "/applications/import",
    { bodyLimit: 2 * 1024 * 1024 },
    async (req, reply) => {
      const csv = input(req.body);
      const preview = previewCsv(csv);
      if (preview.errors.length)
        throw badRequest(
          `Import rejected. Row ${preview.errors[0].row}: ${preview.errors[0].message}`,
        );
      const checksum = createHash("sha256")
        .update(JSON.stringify(preview.records))
        .digest("hex");
      const userId = owner(req);
      return db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
        if (
          await tx.importBatch.findUnique({
            where: { userId_checksum: { userId, checksum } },
          })
        )
          throw badRequest(
            "This file has already been imported. No applications were added.",
            409,
          );
        const rows = preview.records.map((row) => ({
          ...row,
          id: randomUUID(),
          userId,
          dateApplied: row.dateApplied ? new Date(row.dateApplied) : null,
        }));
        await tx.importBatch.create({
          data: { userId, checksum, count: rows.length },
        });
        await tx.application.createMany({ data: rows });
        await tx.statusHistory.createMany({
          data: rows.map((row) => ({
            applicationId: row.id,
            toStatus: row.status,
          })),
        });
        reply.code(201);
        return { imported: rows.length };
      });
    },
  );
  app.get("/contacts", async (req) => {
    const q = z
      .object({
        search: z.string().max(200).default(""),
        applicationId: z.string().optional(),
      })
      .parse(req.query);
    return db.contact.findMany({
      where: {
        userId: owner(req),
        applicationId: q.applicationId,
        ...(q.search
          ? {
              OR: [
                { name: { contains: q.search, mode: "insensitive" } },
                { company: { contains: q.search, mode: "insensitive" } },
                { email: { contains: q.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        application: { select: { id: true, company: true, jobTitle: true } },
      },
      orderBy: { name: "asc" },
    });
  });
  for (const method of ["POST", "PUT"] as const)
    app.route({
      method,
      url: method === "POST" ? "/contacts" : "/contacts/:id",
      handler: async (req, reply) => {
        const data = contactSchema.parse(req.body);
        const userId = owner(req);
        return db.$transaction(async (tx) => {
          if (
            data.applicationId &&
            !(await tx.application.findFirst({
              where: { id: data.applicationId, userId },
            }))
          )
            throw notFound();
          if (method === "POST") {
            reply.code(201);
            return tx.contact.create({ data: { ...data, userId } });
          }
          const result = await tx.contact.updateMany({
            where: { id: routeId(req), userId },
            data,
          });
          if (!result.count) throw notFound();
          return { ok: true };
        });
      },
    });
  app.delete("/contacts/:id", async (req, reply) => {
    const result = await db.contact.deleteMany({
      where: { id: routeId(req), userId: owner(req) },
    });
    if (!result.count) throw notFound();
    return reply.code(204).send();
  });
}
