/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

// Na GitHub Pages aplikacja stoi pod adresem /nazwa-repo/. Workflow ustawia BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
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
