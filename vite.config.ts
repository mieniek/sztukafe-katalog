/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

// Na GitHub Pages aplikacja stoi pod adresem /nazwa-repo/. Workflow ustawia BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

// Content-Security-Policy w <meta>, bo GitHub Pages nie pozwala ustawiać nagłówków. Tylko w buildzie —
// serwer deweloperski wstrzykuje własne skrypty inline. `frame-ancestors` w <meta> nie działa, dlatego go brak.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data: https://www.googleapis.com https://api.nbp.pl https://accounts.google.com",
  "frame-src https://accounts.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'sztukafe-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
  ],
});

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'SztuKaFe',
        short_name: 'SztuKaFe',
        description: 'Katalog dzieł galerii SztuKaFe',
        lang: 'pl',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        background_color: '#121211',
        theme_color: '#121211',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,ttf}'],
        // Czcionki Noto Sans do PDF mają po ok. 630 KB — muszą być w pamięci podręcznej, by PDF powstawał offline.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    // testy e2e (Playwright) uruchamia osobne polecenie: npm run test:e2e
    exclude: ['e2e/**', 'node_modules/**', 'dist*/**'],
  },
});
