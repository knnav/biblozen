import { defineConfig, devices } from '@playwright/test';

const viewport = { width: 1280, height: 800 };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'retain-on-failure',
    viewport,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /\.perf\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport },
    },
    {
      // Performance runs against the production build (no dev-mode overhead).
      name: 'perf',
      testMatch: /\.perf\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport, baseURL: 'http://localhost:4173' },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:1420',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command:
        'npx vite build --outDir dist-perf --emptyOutDir && npx vite preview --outDir dist-perf --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
