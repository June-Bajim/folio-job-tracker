import { beforeAll, afterAll, it, expect, vi } from "vitest";
import type { FastifyInstance } from "fastify";
let app: FastifyInstance;
beforeAll(async () => {
  // Reproduce addresses pasted from browser address bars with trailing slashes.
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4000/");
  vi.stubEnv("WEB_URL", "http://localhost:3000/");
  const { buildApp } = await import("../apps/api/src/app.js");
  app = buildApp();
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  const { db } = await import("../packages/server/db.js");
  await db.$disconnect();
  vi.unstubAllEnvs();
});
it("routes session checks correctly with trailing-slash configuration", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/auth/get-session",
  });
  expect(response.statusCode, response.body).toBe(200);
  expect(response.json()).toBeNull();
});
it("reaches signup validation instead of returning a route or origin error", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: "http://localhost:3000" },
    payload: {},
  });
  expect(response.statusCode, response.body).toBe(400);
});
