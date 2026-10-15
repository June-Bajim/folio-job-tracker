import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import {
  applicationSchema,
  statuses,
  arrangements,
  type ApplicationInput,
} from "../shared/schemas.js";
export const csvColumns = [
  "company",
  "jobTitle",
  "jobUrl",
  "location",
  "arrangement",
  "salaryMin",
  "salaryMax",
  "currency",
  "status",
  "dateApplied",
  "notes",
] as const;
const escapeCell = (value: unknown) =>
  typeof value === "string" && /^[\s]*[=+\-@\t\r\n]/.test(value)
    ? `'${value}`
    : value;
export function exportCsv(rows: Record<string, unknown>[]) {
  return stringify(
    rows.map((row) =>
      Object.fromEntries(
        csvColumns.map((key) => [key, escapeCell(row[key] ?? "")]),
      ),
    ),
    { header: true, columns: [...csvColumns], bom: true },
  );
}
export function previewCsv(csv: string) {
  let rows: Record<string, string>[];
  try {
    rows = parse(csv, {
      bom: true,
      columns: (headers: string[]) => {
        const mapped = headers.map((h) => h.trim());
        if (
          new Set(mapped).size !== mapped.length ||
          !mapped.includes("company") ||
          !mapped.includes("jobTitle")
        )
          throw new Error(
            "Headers must include company and jobTitle, without duplicate columns.",
          );
        if (
          mapped.some(
            (h) => !csvColumns.includes(h as (typeof csvColumns)[number]),
          )
        )
          throw new Error("Unknown columns. Use the downloadable template.");
        return mapped;
      },
      skip_empty_lines: true,
      max_record_size: 100000,
    });
  } catch (error) {
    return {
      records: [] as ApplicationInput[],
      errors: [{ row: 1, message: (error as Error).message }],
      total: 0,
    };
  }
  if (rows.length === 0 || rows.length > 500)
    return {
      records: [] as ApplicationInput[],
      errors: [
        { row: 1, message: "Import between 1 and 500 applications at a time." },
      ],
      total: rows.length,
    };
  const records: ApplicationInput[] = [];
  const errors: { row: number; message: string }[] = [];
  rows.forEach((row, index) => {
    for (const key of Object.keys(row))
      if (/^'[\s]*[=+\-@\t\r\n]/.test(row[key])) row[key] = row[key].slice(1);
    const status = statuses.find(
      (s) => s.toLowerCase() === (row.status || "Saved").trim().toLowerCase(),
    );
    const arrangement = arrangements.find(
      (s) => s === (row.arrangement || "remote").trim().toLowerCase(),
    );
    const result = applicationSchema.safeParse({
      ...row,
      jobUrl: row.jobUrl || null,
      dateApplied: row.dateApplied || null,
      status: status ?? row.status,
      arrangement: arrangement ?? row.arrangement,
      currency: row.currency?.trim().toUpperCase() || "USD",
      salaryMin: row.salaryMin?.trim() ? Number(row.salaryMin) : null,
      salaryMax: row.salaryMax?.trim() ? Number(row.salaryMax) : null,
    });
    if (result.success) records.push(result.data);
    else
      errors.push({
        row: index + 2,
        message: result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
  });
  return { records, errors, total: rows.length };
}
