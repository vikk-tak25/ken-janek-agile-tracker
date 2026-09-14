const { defineConfig } = require('@playwright/test');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

module.exports = defineConfig({
  testDir: './e2e',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3138',
    viewport: { width: 1440, height: 1600 },
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true
  },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3138',
    reuseExistingServer: false,
    env: { PORT: '3138', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'agile-tracker-ui-')) }
  }
});
