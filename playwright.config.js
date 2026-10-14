import { defineConfig } from "@playwright/test";
import { HEIGHTS, HOST, PORTS, TOUCH_MAX, WIDTHS } from "./e2e/support/env.js";

const server = (app) => ({
  command: `npm run preview -w ${app} -- --host ${HOST} --port ${PORTS[app]} --strictPort`,
  url: `http://${HOST}:${PORTS[app]}`,
  reuseExistingServer: !process.env.CI,
  timeout: 60_000
});

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.js",
  outputDir: "test-results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}",
  globalSetup: "./e2e/support/setup.js",
  globalTeardown: "./e2e/support/teardown.js",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  updateSnapshots: process.env.CI ? "none" : "missing",
  reporter: process.env.CI ? [["list"], ["github"], ["html", { open: "never" }]] : [["list"]],
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled", caret: "hide", scale: "css" }
  },
  use: {
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-KE",
    timezoneId: "Africa/Nairobi",
    serviceWorkers: "block",
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: ["--font-render-hinting=none", "--force-color-profile=srgb", "--disable-lcd-text"]
    }
  },
  projects: WIDTHS.map((width) => {
    const touch = width <= TOUCH_MAX;
    return {
      name: `w${width}`,
      use: { viewport: { width, height: HEIGHTS[width] }, hasTouch: touch, isMobile: touch }
    };
  }),
  webServer: ["client", "seller", "admin"].map(server)
});
