import { describe, it, expect } from "vitest";
import {
  applicationSchema,
  interviewSchema,
  listSchema,
  settingsSchema,
  reminderSchema,
} from "../packages/shared/schemas.js";
describe("Shared server validation", () => {
  const base = { company: "Acme", jobTitle: "Engineer" };
  it("requires company and job title", () => {
    expect(applicationSchema.safeParse({ ...base, company: " " }).success).toBe(
      false,
    );
    expect(applicationSchema.safeParse({ ...base, jobTitle: "" }).success).toBe(
      false,
    );
  });
  it("rejects unsafe URLs, invalid dates and salary ranges", () => {
    for (const extra of [
      { jobUrl: "javascript:alert(1)" },
      { dateApplied: "2026-02-30" },
      { salaryMin: 100, salaryMax: 50 },
      { salaryMin: -1 },
      { salaryMax: 2147483648 },
    ])
      expect(applicationSchema.safeParse({ ...base, ...extra }).success).toBe(
        false,
      );
  });
  it("accepts optional values and normalizes whitespace", () => {
    const value = applicationSchema.parse({
      ...base,
      company: " Acme ",
      jobUrl: null,
      dateApplied: null,
      salaryMin: null,
      salaryMax: null,
    });
    expect(value.company).toBe("Acme");
    expect(value.status).toBe("Saved");
  });
  it("bounds pagination and rejects unknown filters", () => {
    expect(listSchema.parse({ page: "2" }).page).toBe(2);
    for (const q of [
      { page: 0 },
      { pageSize: 101 },
      { status: "invalid" },
      { sort: "password" },
    ])
      expect(listSchema.safeParse(q).success).toBe(false);
  });
  it("requires timezone-aware event timestamps", () => {
    expect(
      reminderSchema.safeParse({
        message: "Follow up",
        dueAt: "2026-10-15T12:00",
      }).success,
    ).toBe(false);
    expect(
      interviewSchema.safeParse({
        title: "Interview",
        startsAt: "2026-10-15T12:00:00+03:00",
        format: "video",
        duration: 0,
      }).success,
    ).toBe(false);
  });
  it("validates timezone names", () => {
    expect(
      settingsSchema.safeParse({ name: "Jane", timezone: "Africa/Nairobi" })
        .success,
    ).toBe(true);
    expect(
      settingsSchema.safeParse({ name: "Jane", timezone: "Mars/Olympus" })
        .success,
    ).toBe(false);
  });
});
