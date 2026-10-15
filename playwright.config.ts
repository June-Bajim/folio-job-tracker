import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  fullyParallel: false,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://localhost:4000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: "npm run dev:web",
      url: "http://localhost:3000/login",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
