import { expect, it } from "vitest";
import { readJsonResponse } from "../apps/web/lib/response.js";

it("handles empty and HTML server failures without JSON parsing errors", async () => {
  for (const body of [null, "<html>Bad gateway</html>"]) {
    await expect(
      readJsonResponse(new Response(body, { status: 500 })),
    ).rejects.toThrow("temporarily unavailable (HTTP 500)");
  }
});
it("preserves JSON errors, null sessions, and no-content responses", async () => {
  const error = { message: "Email delivery unavailable" };
  expect(await readJsonResponse(Response.json(error, { status: 503 }))).toEqual(
    error,
  );
  expect(await readJsonResponse(Response.json(null))).toBeNull();
  expect(
    await readJsonResponse(new Response(null, { status: 204 })),
  ).toBeUndefined();
});
it("does not mistake empty successful responses for successful operations", async () => {
  await expect(readJsonResponse(new Response(null))).rejects.toThrow(
    "invalid response",
  );
});
