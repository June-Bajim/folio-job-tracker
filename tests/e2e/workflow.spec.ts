import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { db } from "../../packages/server/db.js";
const email = `browser-${Date.now()}@example.com`;
test.afterAll(async () => {
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
});
test("register, login, create application, change status, add interview and reminder", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/login/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Your name").fill("Alex Morgan");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-password-2026!");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/verify-email/);
  const inbox = (await (
    await fetch(
      `http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    )
  ).json()) as { messages: { ID: string; Subject: string }[] };
  const verification = inbox.messages.find(
    (m) => m.Subject === "Verify your Folio email",
  );
  expect(verification).toBeDefined();
  const content = (await (
    await fetch(`http://localhost:8025/api/v1/message/${verification!.ID}`)
  ).json()) as { Text: string };
  await page.goto(content.Text.match(/https?:\/\/\S+/)![0]);
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-password-2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
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
  const applicationUrl = page.url();
  await page.getByRole("button", { name: "Add contact" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Jamie Recruiter");
  await page.getByLabel("Email", { exact: true }).fill("jamie@example.com");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(
    page.getByRole("heading", { name: "Jamie Recruiter" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "Add document" }).click();
  await page.getByLabel("Document name").fill("Product resume");
  await page.getByLabel("Version label").fill("Original");
  await page.getByLabel(/File \(PDF/).setInputFiles({
    name: "resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nOriginal resume\n%%EOF"),
  });
  await page.getByRole("button", { name: "Save document version" }).click();
  await expect(
    page.getByRole("heading", { name: "v1 · Original" }),
  ).toBeVisible();
  await page.goto(applicationUrl);
  await page
    .getByLabel("Choose document version")
    .selectOption({ label: "Product resume · v1 · Original" });
  await page.getByRole("button", { name: "Link version" }).click();
  await expect(
    page.getByRole("heading", { name: "Product resume · v1 · Original" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.getByRole("button", { name: "New version" }).click();
  await page.getByLabel("Version label").fill("Revised");
  await page.getByLabel(/File \(PDF/).setInputFiles({
    name: "resume-v2.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nRevised resume\n%%EOF"),
  });
  await page.getByRole("button", { name: "Save document version" }).click();
  await expect(
    page.getByRole("heading", { name: "v2 · Revised" }),
  ).toBeVisible();
  await page.goto(applicationUrl);
  await expect(
    page.getByRole("heading", { name: "Product resume · v1 · Original" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  const downloadHref = await page
    .getByRole("link", { name: "Download submitted file" })
    .getAttribute("href");
  const documentResponse = await page.request.get(downloadHref!);
  expect(documentResponse.status(), await documentResponse.text()).toBe(200);
  expect(documentResponse.headers()["content-type"]).toContain(
    "application/pdf",
  );
  expect(documentResponse.headers()["content-disposition"]).toContain(
    "resume.pdf",
  );
  await page.getByRole("link", { name: "Download submitted file" }).click();
  const downloadedFile = await download;
  const downloadedBody = await readFile((await downloadedFile.path())!, "utf8");
  expect(downloadedBody.slice(0, 500)).toContain("%PDF-1.7");
  expect(downloadedBody).toContain("Original resume");
  expect(downloadedFile.suggestedFilename()).toBe("resume.pdf");
  await page.getByRole("link", { name: "All applications" }).click();
  await page
    .getByRole("textbox", { name: "Search applications" })
    .fill("Northstar");
  await expect(page).toHaveURL(/search=Northstar/);
  await expect(
    page.getByRole("link", { name: "N Northstar Studio Product Designer" }),
  ).toBeVisible();
  const exportDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  expect((await exportDownload).suggestedFilename()).toBe(
    "folio-applications.csv",
  );
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await page.getByLabel("Choose CSV file").setInputFiles({
    name: "applications.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("company,jobTitle\nImported Co,Engineer"),
  });
  await expect(
    page.getByRole("button", { name: "Confirm import of 1 applications" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm import of 1 applications" })
    .click();
  await expect(
    page.getByText("Imported 1 applications.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
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
  ).toContainText("2");
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
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Jamie Recruiter" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/contacts-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "v2 · Revised" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/documents-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("link", { name: "Email delivery", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Email delivery." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Account security" }),
  ).toBeVisible();
  await page
    .getByLabel("Current password", { exact: true })
    .fill("Browser-password-2026!");
  await page
    .getByLabel("New password", { exact: true })
    .fill("Changed-browser-password-2026!");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("Changed-browser-password-2026!");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(
    page.getByText("Password changed. Other sessions have been signed out.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  await page
    .getByLabel("Your password", { exact: true })
    .fill("Changed-browser-password-2026!");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("button", { name: "Permanently delete my account", exact: true })
    .click();
  await expect(page).toHaveURL(/login/);
});
