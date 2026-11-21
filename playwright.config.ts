import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const systemChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  || (process.platform === 'win32' && existsSync(systemChrome) ? systemChrome : undefined);

export default defineConfig({
  testDir: './tests',
  testMatch: '*.browser.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4199',
    launchOptions: {
      executablePath,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
    viewport: { width: 1440, height: 920 },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4199 --strictPort',
    url: 'http://127.0.0.1:4199',
    reuseExistingServer: false,
  },
});
