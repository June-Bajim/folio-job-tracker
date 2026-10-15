import { z } from "zod";
export const statuses = [
  "Saved",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
  "Withdrawn",
] as const;
export const arrangements = ["remote", "hybrid", "onsite"] as const;
const url = z
  .string()
  .url()
  .refine(
    (v) => ["http:", "https:"].includes(new URL(v).protocol),
    "Use an HTTP or HTTPS URL",
  )
  .nullable()
  .optional();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
export const applicationSchema = z
  .object({
    company: z.string().trim().min(1).max(200),
    jobTitle: z.string().trim().min(1).max(200),
    jobUrl: url,
    location: z.string().max(300).default(""),
    arrangement: z.enum(arrangements).default("remote"),
    salaryMin: z.number().int().min(0).max(2147483647).nullable().optional(),
    salaryMax: z.number().int().min(0).max(2147483647).nullable().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("USD"),
    status: z.enum(statuses).default("Saved"),
    dateApplied: date.nullable().optional(),
    notes: z.string().max(20000).default(""),
  })
  .refine(
    (v) =>
      v.salaryMin == null || v.salaryMax == null || v.salaryMin <= v.salaryMax,
    {
      message: "Maximum salary must be at least minimum salary",
      path: ["salaryMax"],
    },
  );
export const interviewSchema = z.object({
  title: z.string().trim().min(1).max(200),
  startsAt: z.string().datetime({ offset: true }),
  duration: z.number().int().min(1).max(1440).nullable().optional(),
  format: z.enum(["video", "phone", "onsite"]),
  meetingUrl: url,
  location: z.string().max(300).default(""),
  notes: z.string().max(10000).default(""),
});
export const reminderSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  dueAt: z.string().datetime({ offset: true }),
});
export const listSchema = z.object({
  search: z.string().max(200).default(""),
  status: z.enum(statuses).optional(),
  arrangement: z.enum(arrangements).optional(),
  sort: z.enum(["createdAt", "dateApplied", "company"]).default("createdAt"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid IANA timezone"),
});
export type ApplicationInput = z.infer<typeof applicationSchema>;
export const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).default(""),
  title: z.string().trim().max(200).default(""),
  email: z.string().email().max(254).nullable().optional(),
  phone: z.string().max(80).default(""),
  profileUrl: url,
  notes: z.string().max(10000).default(""),
  applicationId: z.string().min(1).nullable().optional(),
});
export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;
export const documentUploadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["resume", "cover_letter"]),
  label: z.string().trim().min(1).max(100),
  filename: z
    .string()
    .min(1)
    .max(200)
    .refine(
      (v) =>
        !v.includes("/") &&
        !v.includes("\\") &&
        Array.from(v).every(
          (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127,
        ),
      "Use a filename without path separators or control characters",
    ),
  content: z
    .string()
    .min(1)
    .max(Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  notes: z.string().max(10000).default(""),
});
