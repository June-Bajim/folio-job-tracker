import { test, expect } from "@playwright/test";
import { db } from "../../packages/server/db.js";
const email = `browser-${Date.now()}@example.com`;
test.afterAll(async () => {
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
});
test("register, login, create application, change status, add interview and reminder", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/login/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Your name").fill("Alex Morgan");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-password-2026!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-password-2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page
    .getByRole("link", { name: "Add application", exact: false })
    .first()
    .click();
  await page.getByLabel("Company", { exact: false }).fill("Northstar Studio");
  await page.getByLabel("Job title", { exact: false }).fill("Product Designer");
  await page.getByLabel("Status", { exact: true }).selectOption("Applied");
  await page.getByRole("button", { name: "Create application" }).click();
  await expect(
    page.getByRole("heading", { name: "Product Designer", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit application", exact: true })
    .click();
  await page.getByLabel("Status", { exact: true }).selectOption("Interviewing");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("From Applied")).toBeVisible();
  await page.getByRole("button", { name: "Add interview" }).click();
  await page.getByLabel("Interview title").fill("Portfolio conversation");
  await page
    .getByLabel("Starts at")
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Save interview" }).click();
  await expect(
    page.getByRole("heading", { name: "Portfolio conversation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add reminder" }).click();
  await page.getByLabel("Reminder message").fill("Send a thoughtful thank-you");
  await page
    .getByLabel("Due at")
    .fill(new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Save reminder" }).click();
  await expect(
    page.getByRole("heading", { name: "Send a thoughtful thank-you" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All applications" }).click();
  await page
    .getByRole("textbox", { name: "Search applications" })
    .fill("Northstar");
  await expect(page).toHaveURL(/search=Northstar/);
  await expect(
    page.getByRole("link", { name: "N Northstar Studio Product Designer" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/applications-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.screenshot({
    path: "test-results/applications-mobile.png",
    fullPage: true,
  });
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    root: document.documentElement.scrollWidth,
    overflow: Array.from(document.querySelectorAll("body *"))
      .filter((e) => e.getBoundingClientRect().width > window.innerWidth)
      .map((e) => ({
        tag: e.tagName,
        cls: e.className,
        width: e.getBoundingClientRect().width,
      }))
      .slice(0, 15),
  }));
  expect(dimensions.root, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.viewport,
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /Total applications/ }),
  ).toContainText("1");
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
