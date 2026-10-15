import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "../../../../packages/server/db.js";
import {
  documentUploadSchema,
  MAX_DOCUMENT_BYTES,
} from "../../../../packages/shared/schemas.js";
import { owner, routeId, notFound, badRequest } from "./data.js";
const versionSelect = {
  id: true,
  documentId: true,
  number: true,
  label: true,
  filename: true,
  mimeType: true,
  size: true,
  sha256: true,
  notes: true,
  createdAt: true,
} as const;
function upload(body: unknown) {
  const data = documentUploadSchema.parse(body);
  const content = Buffer.from(data.content, "base64");
  if (!content.length || content.length > MAX_DOCUMENT_BYTES)
    throw badRequest("Files must be between 1 byte and 3 MB.");
  const pdf =
    data.filename.toLowerCase().endsWith(".pdf") &&
    content.subarray(0, 5).toString() === "%PDF-";
  const docx =
    data.filename.toLowerCase().endsWith(".docx") &&
    content.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) &&
    content.includes(Buffer.from("word/document.xml")) &&
    content.includes(Buffer.from("[Content_Types].xml"));
  if (!pdf && !docx) throw badRequest("Upload a valid PDF or DOCX file.");
  return {
    data,
    version: {
      label: data.label,
      filename: data.filename,
      mimeType: pdf
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: content.length,
      content,
      sha256: createHash("sha256").update(content).digest("hex"),
      notes: data.notes,
    },
  };
}
export function documentRoutes(app: FastifyInstance) {
  app.get("/documents", async (req) =>
    db.document.findMany({
      where: { userId: owner(req) },
      include: {
        versions: {
          select: {
            ...versionSelect,
            applications: {
              select: {
                applicationId: true,
                application: { select: { company: true, jobTitle: true } },
              },
            },
          },
          orderBy: { number: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  );
  for (const isVersion of [false, true])
    app.post(
      isVersion ? "/documents/:id/versions" : "/documents",
      { bodyLimit: 8 * 1024 * 1024 },
      async (req, reply) => {
        const { data, version } = upload(req.body);
        const userId = owner(req);
        return db.$transaction(async (tx) => {
          // Serialize per-user uploads to enforce a bounded database storage quota.
          await tx.$executeRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
          const usage = await tx.documentVersion.aggregate({
            where: { document: { userId } },
            _sum: { size: true },
          });
          if ((usage._sum.size ?? 0) + version.size > 100 * 1024 * 1024)
            throw badRequest(
              "Your document library is limited to 100 MB. Delete unused documents before uploading.",
              413,
            );
          reply.code(201);
          if (!isVersion)
            return tx.document.create({
              data: {
                userId,
                name: data.name,
                kind: data.kind,
                versions: { create: { ...version, number: 1 } },
              },
              include: { versions: { select: versionSelect } },
            });
          const document = await tx.document.findFirst({
            where: { id: routeId(req), userId },
            include: {
              versions: {
                select: { number: true },
                orderBy: { number: "desc" },
                take: 1,
              },
            },
          });
          if (!document) throw notFound();
          return tx.documentVersion.create({
            data: {
              ...version,
              documentId: document.id,
              number: (document.versions[0]?.number ?? 0) + 1,
            },
            select: versionSelect,
          });
        });
      },
    );
  for (const format of ["download", "content"])
    app.get(`/document-versions/:id/${format}`, async (req, reply) => {
      const version = await db.documentVersion.findFirst({
        where: { id: routeId(req), document: { userId: owner(req) } },
      });
      if (!version) throw notFound();
      if (format === "content")
        return reply
          .header("Cache-Control", "private, no-store")
          .send({
            filename: version.filename,
            mimeType: version.mimeType,
            content: Buffer.from(version.content).toString("base64"),
          });
      return reply
        .type(version.mimeType)
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "private, no-store")
        .header(
          "Content-Disposition",
          `attachment; filename="document-v${version.number}.${version.filename.toLowerCase().endsWith(".pdf") ? "pdf" : "docx"}"; filename*=UTF-8''${encodeURIComponent(version.filename).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
        )
        .send(Buffer.from(version.content));
    });
  app.delete("/documents/:id", async (req, reply) => {
    const result = await db.document.deleteMany({
      where: { id: routeId(req), userId: owner(req) },
    });
    if (!result.count) throw notFound();
    return reply.code(204).send();
  });
  app.get("/applications/:id/documents", async (req) => {
    if (
      !(await db.application.findFirst({
        where: { id: routeId(req), userId: owner(req) },
      }))
    )
      throw notFound();
    return db.applicationDocument.findMany({
      where: { applicationId: routeId(req) },
      include: {
        version: {
          select: {
            ...versionSelect,
            document: { select: { id: true, name: true, kind: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  });
  app.post("/applications/:id/documents", async (req, reply) => {
    const { versionId } = z
      .object({ versionId: z.string().min(1) })
      .parse(req.body);
    const userId = owner(req);
    return db.$transaction(async (tx) => {
      if (
        !(await tx.application.findFirst({
          where: { id: routeId(req), userId },
        })) ||
        !(await tx.documentVersion.findFirst({
          where: { id: versionId, document: { userId } },
        }))
      )
        throw notFound();
      const link = await tx.applicationDocument.upsert({
        where: {
          applicationId_versionId: { applicationId: routeId(req), versionId },
        },
        create: { applicationId: routeId(req), versionId },
        update: {},
      });
      reply.code(201);
      return link;
    });
  });
  app.delete("/applications/:id/documents/:linkId", async (req, reply) => {
    const { linkId } = z.object({ linkId: z.string() }).parse(req.params);
    const result = await db.applicationDocument.deleteMany({
      where: {
        id: linkId,
        applicationId: routeId(req),
        application: { userId: owner(req) },
      },
    });
    if (!result.count) throw notFound();
    return reply.code(204).send();
  });
}
