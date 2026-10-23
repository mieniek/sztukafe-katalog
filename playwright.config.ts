import { defineConfig, devices } from '@playwright/test';

/**
 * Testy e2e uruchamiają prawdziwą, zbudowaną aplikację (z działającym Service Workerem) w przeglądarce
 * z rozmiarem iPhone'a 15 i iPada. Google (logowanie i Dysk) jest atrapą (e2e/support/fakeGoogle.ts).
 *
 * Lokalnie używamy zainstalowanego Chrome (bez pobierania przeglądarki), w CI — Chromium z Playwrighta.
 * Silnik to Chromium z rozmiarem i dotykiem iPhone'a; Safari (WebKit) wymaga prawdziwego urządzenia.
 */
const channel = process.env.CI ? undefined : 'chrome';

function mobile(name: 'iPhone 15' | 'iPad (gen 7)') {
  const { defaultBrowserType: _ignored, ...device } = devices[name];
  return { ...device, channel };
}

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
  },
  projects: [
    { name: 'iphone', use: mobile('iPhone 15'), testIgnore: /ipad\.spec\.ts/ },
    { name: 'ipad', use: mobile('iPad (gen 7)'), testMatch: /ipad\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run build:e2e && npx vite preview --outDir dist-e2e --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
