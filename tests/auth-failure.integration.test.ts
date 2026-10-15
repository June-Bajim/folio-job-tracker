import { afterAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("../packages/server/email.js", async (original) => ({
  ...(await original<typeof import("../packages/server/email.js")>()),
  sendEmail: vi.fn(),
}));
import { sendEmail, EmailDeliveryError } from "../packages/server/email.js";
import { auth } from "../packages/server/auth.js";
import { buildApp } from "../apps/api/src/app.js";
import { db } from "../packages/server/db.js";
const app = buildApp();
const email = `failure-${randomUUID()}@example.com`;
afterAll(async () => {
  vi.restoreAllMocks();
  await db.user.deleteMany({ where: { email } });
  await app.close();
  await db.$disconnect();
});
it("returns a useful JSON error when verification delivery fails", async () => {
  vi.mocked(sendEmail).mockResolvedValue(undefined);
  const signup = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: "http://localhost:3000" },
    payload: {
      name: "Failure test",
      email,
      password: "Original-password-2026!",
    },
  });
  expect(signup.statusCode, signup.body).toBe(200);
  vi.mocked(sendEmail).mockRejectedValue(
    new EmailDeliveryError(403, "validation_error"),
  );
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/send-verification-email",
    headers: { origin: "http://localhost:3000" },
    payload: { email },
  });
  expect(response.statusCode, response.body).toBe(503);
  expect(response.json().message).toContain("couldn't send the email");
  expect(
    (await db.user.findUniqueOrThrow({ where: { email } })).emailVerified,
  ).toBe(false);
});
it("converts empty authentication errors into JSON", async () => {
  vi.spyOn(auth, "handler").mockResolvedValueOnce(
    new Response(null, { status: 500 }),
  );
  const response = await app.inject({
    method: "GET",
    url: "/api/auth/get-session",
  });
  expect(response.statusCode).toBe(500);
  expect(response.json().error.code).toBe("AUTH_SERVICE_UNAVAILABLE");
});
