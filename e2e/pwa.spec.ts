import { expect, test } from '@playwright/test';
import { waitForOfflineReady } from './support/app';

/**
 * Kryteria instalowalności PWA. Lighthouse 12 usunął kategorię „PWA”, więc sprawdzamy je bezpośrednio:
 * lista błędów instalowalności z Chrome (CDP), manifest, Service Worker i start offline.
 */
test.describe('PWA', () => {
  test('Chrome nie zgłasza żadnych błędów instalowalności', async ({ page, context }) => {
    await page.goto('/');
    await waitForOfflineReady(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    // "in-incognito": konteksty testowe są anonimowe — to jedyny dopuszczalny powód.
    const real = installabilityErrors.filter((e) => e.errorId !== 'in-incognito');
    expect(real.map((e) => `${e.errorId} ${JSON.stringify(e.errorArguments)}`)).toEqual([]);
  });

  test('manifest ma nazwę, tryb standalone, ikony 192/512 (także maskable) i kolory', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel=manifest]').getAttribute('href');
    const manifest = await (await request.get(href!)).json();
    expect(manifest.name).toBe('SztuKaFe');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('pl');
    expect(manifest.theme_color).toBe('#121211');
    expect(manifest.background_color).toBe('#121211');
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  });

  test('ma meta dla iOS, apple-touch-icon, viewport-fit=cover i motyw koloru', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('meta[name=apple-mobile-web-app-capable]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name=apple-mobile-web-app-status-bar-style]')).toHaveAttribute('content', 'black-translucent');
    await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content', /viewport-fit=cover/);
    await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', '#121211');
    const icon = await page.locator('link[rel=apple-touch-icon]').getAttribute('href');
    const res = await request.get(icon!);
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toContain('image/png');
  });

  test('uruchamia się w trybie samolotowym (strona i czcionki z pamięci Service Workera)', async ({ page, context }) => {
    await page.goto('/');
    await waitForOfflineReady(page);
    await context.setOffline(true);
    await page.goto('/#/katalog');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Katalog' })).toBeVisible();
    // czcionka marki została załadowana z pamięci podręcznej
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
    });
    expect(loaded.join(' ')).toMatch(/Unbounded|Geist/);
  });
});
