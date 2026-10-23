import { expect, type BrowserContext, type Page } from '@playwright/test';
import { FakeGoogle } from './fakeGoogle';

/** Czeka, aż Service Worker przejmie stronę — dopiero wtedy aplikacja działa offline. */
export async function waitForOfflineReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 30_000 }).catch(async () => {
    await page.reload(); // pierwsze wejście: SW przejmuje kontrolę dopiero po ponownym załadowaniu
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 30_000 });
  });
}

/** Rozmiar zdjęcia testowego: duże, jak z aparatu, żeby przejść prawdziwą kompresję. */
export async function pickPhoto(page: Page, input: 'camera' | 'gallery', label: string) {
  await page.evaluate(
    async ({ input, label }) => {
      const c = document.createElement('canvas');
      c.width = 3000;
      c.height = 2000;
      const g = c.getContext('2d')!;
      const grad = g.createLinearGradient(0, 0, 3000, 2000);
      grad.addColorStop(0, '#b5651d');
      grad.addColorStop(1, '#1f4e79');
      g.fillStyle = grad;
      g.fillRect(0, 0, 3000, 2000);
      g.fillStyle = '#fff';
      g.font = '280px Georgia';
      g.fillText(label, 260, 1100);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
      const file = new File([blob], `${label}.jpg`, { type: 'image/jpeg' });
      const el = document.querySelector<HTMLInputElement>(`[data-testid=photo-${input}]`)!;
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { input, label },
  );
}

export interface NewArtwork {
  title: string;
  artist: string;
  width?: string;
  height?: string;
  price?: string;
  photos?: number;
  purchase?: string;
  min?: string;
}

/** Dodaje dzieło kreatorem: zdjęcia → formularz → zapis. Zwraca po przejściu na kartę dzieła. */
export async function addArtwork(page: Page, a: NewArtwork) {
  await page.goto('/#/nowe');
  const photos = a.photos ?? 1;
  await expect(page.getByRole('heading', { name: 'Przód' })).toBeVisible();
  await pickPhoto(page, 'camera', 'Przod');
  for (let i = 1; i < photos; i++) {
    await expect(page.getByRole('button', { name: 'Pomiń' })).toBeVisible();
    await pickPhoto(page, 'camera', `Ujecie ${i + 1}`);
  }
  if (photos < 5) await page.getByRole('button', { name: /Do danych/ }).click();
  await page.getByLabel('Tytuł').fill(a.title);
  await page.getByLabel('Artysta').fill(a.artist);
  await page.getByLabel('Szerokość w cm').fill(a.width ?? '60');
  await page.getByLabel('Wysokość w cm').fill(a.height ?? '80');
  await page.getByLabel('Cena sprzedaży').fill(a.price ?? '1500');
  if (a.purchase) await page.getByLabel('Cena zakupu').fill(a.purchase);
  if (a.min) await page.getByLabel('Cena minimalna').fill(a.min);
  await page.getByRole('button', { name: 'Zapisz dzieło' }).click();
  await expect(page).toHaveURL(/#\/dzielo\//);
}

/** Loguje urządzenie „przez Google” (atrapa) i czeka na pierwszą synchronizację. */
export async function signIn(page: Page) {
  await page.goto('/#/ustawienia/synchronizacja');
  await page.getByRole('button', { name: 'Zaloguj przez Google' }).click();
  await expect(page.getByRole('button', { name: 'Synchronizuj teraz' })).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByTestId('sync-state')).not.toHaveAttribute('data-last-sync', '', { timeout: 30_000 });
}

export async function syncNow(page: Page) {
  await page.goto('/#/ustawienia/synchronizacja');
  const state = page.getByTestId('sync-state');
  const button = page.getByRole('button', { name: 'Synchronizuj teraz' });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  const before = await state.getAttribute('data-last-sync');
  await button.click();
  // koniec synchronizacji = nowy znacznik czasu ostatniego udanego przebiegu
  await expect(state).not.toHaveAttribute('data-last-sync', before ?? '', { timeout: 30_000 });
  await expect(state).toHaveAttribute('data-status', 'idle');
}

/** Nowe „urządzenie”: osobny kontekst przeglądarki (własna baza i Service Worker) podpięty do wspólnego Dysku. */
export async function newDevice(
  browser: import('@playwright/test').Browser,
  options: Parameters<import('@playwright/test').Browser['newContext']>[0],
  google: FakeGoogle,
  email: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(options);
  await google.attach(context, email);
  const page = await context.newPage();
  if (process.env.E2E_DEBUG) {
    page.on('console', (m) => m.type() === 'error' && console.log(`[${email}] console:`, m.text()));
    page.on('response', (r) => r.status() >= 400 && console.log(`[${email}] ${r.status()} ${r.request().method()} ${r.url()}`));
  }
  await page.goto('/');
  return { context, page };
}

/**
 * Tekst widoczny na ekranie. Katalog renderuje listę (telefon) i siatkę (iPad) naraz, a CSS ukrywa jedną z nich,
 * więc zwykłe getByText trafia w dwa elementy.
 */
export const visibleText = (page: Page, text: string | RegExp) => page.getByText(text).filter({ visible: true }).first();
