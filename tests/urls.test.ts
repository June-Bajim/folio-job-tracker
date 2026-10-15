import { describe, it, expect } from "vitest";
import { serviceOrigin } from "../packages/shared/urls.js";
describe("Deployment service origins", () => {
  it("normalizes pasted URLs before adding application routes", () => {
    for (const value of [
      " https://api.example.com/ ",
      "https://api.example.com/api",
      "https://api.example.com//",
    ]) {
      expect(`${serviceOrigin(value, "http://localhost:4000")}/api/me`).toBe(
        "https://api.example.com/api/me",
      );
    }
    expect(
      serviceOrigin("http://localhost:4000/", "http://localhost:3000"),
    ).toBe("http://localhost:4000");
  });
  it("rejects invalid protocols and embedded credentials", () => {
    for (const value of [
      "not-a-url",
      "ftp://api.example.com",
      "https://user:secret@api.example.com",
    ]) {
      expect(() => serviceOrigin(value, "http://localhost:4000")).toThrow();
    }
  });
});
