import { describe, it, expect } from "vitest";
import { exportCsv, previewCsv } from "../packages/server/csv.js";
describe("CSV transfer", () => {
  it("round-trips quoted fields, Unicode, multiline notes, and spreadsheet formula characters", () => {
    const rows = [
      {
        company: 'A, "B"',
        jobTitle: "工程師",
        notes: "First line\nSecond line",
        status: "Applied",
        arrangement: "hybrid",
        currency: "USD",
        salaryMin: 100,
        salaryMax: 200,
        dateApplied: "2026-10-15",
      },
      {
        company: '=HYPERLINK("bad")',
        jobTitle: "+Designer",
        notes: "\tformula",
        status: "Saved",
        arrangement: "remote",
        currency: "USD",
      },
    ];
    const csv = exportCsv(rows);
    expect(csv).toContain("'=HYPERLINK");
    const preview = previewCsv(csv);
    expect(preview.errors).toHaveLength(0);
    expect(preview.records[0].company).toBe(rows[0].company);
    expect(preview.records[0].notes).toBe(rows[0].notes);
    expect(preview.records[1].company).toBe(rows[1].company);
    expect(preview.records[1].notes).toBe("\tformula");
  });
  it("reports row errors and never treats an invalid file as an importable partial batch", () => {
    const preview = previewCsv(
      "company,jobTitle,salaryMin,salaryMax\nAcme,Engineer,100,50\nGood,Designer,10,20",
    );
    expect(preview.errors[0].row).toBe(2);
    expect(preview.records).toHaveLength(1);
    expect(
      previewCsv("company,company,jobTitle\na,b,c").errors[0].message,
    ).toMatch(/duplicate/);
    expect(previewCsv('company,jobTitle\n"broken,row').errors).not.toHaveLength(
      0,
    );
    expect(
      previewCsv(
        "company,jobTitle\n" +
          Array.from({ length: 501 }, () => "A,B").join("\n"),
      ).errors[0].message,
    ).toMatch(/500/);
  });
});
