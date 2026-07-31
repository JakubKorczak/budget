import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    env: {
      ...process.env,
      VITE_GOOGLE_SPREADSHEET_ID: "test-spreadsheet",
      VITE_GOOGLE_API_KEY: "test-api-key",
      VITE_APPS_SCRIPT_URL: "http://127.0.0.1:4173/test-apps-script",
    },
  },
});
