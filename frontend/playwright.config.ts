import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const chromePath =
  process.env.PLAYWRIGHT_CHROME_PATH ||
  (process.env.CI
    ? undefined
    : fs.existsSync("/usr/bin/google-chrome")
      ? "/usr/bin/google-chrome"
      : undefined);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  workers: 2,
  reporter: "list",
  timeout: 30000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:4173",
    ignoreHTTPSErrors: true,
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run preview -- --port 4173 --host 127.0.0.1",
        port: 4173,
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: chromePath,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--ignore-certificate-errors",
          ],
        },
      },
    },
  ],
});
