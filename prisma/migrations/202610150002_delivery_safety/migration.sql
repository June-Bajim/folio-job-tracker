ALTER TABLE "Reminder" ADD COLUMN "deliveryPayload" JSONB;
ALTER TABLE "Application" ADD CONSTRAINT "salary_range_valid" CHECK (("salaryMin" IS NULL OR "salaryMin" >= 0) AND ("salaryMax" IS NULL OR "salaryMax" >= 0) AND ("salaryMin" IS NULL OR "salaryMax" IS NULL OR "salaryMin" <= "salaryMax"));
ALTER TABLE "Interview" ADD CONSTRAINT "duration_valid" CHECK ("duration" IS NULL OR "duration" BETWEEN 1 AND 1440);
ALTER TABLE "Reminder" ADD CONSTRAINT "delivery_status_valid" CHECK ("deliveryStatus" IN ('pending', 'sent', 'failed'));
