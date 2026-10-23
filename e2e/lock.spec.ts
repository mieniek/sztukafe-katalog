import { expect, test } from '@playwright/test';

test.describe('Blokada aplikacji', () => {
  test('po ustawieniu PIN-u i włączeniu blokady aplikacja startuje zablokowana', async ({ page }) => {
    await page.goto('/#/ustawienia/bezpieczenstwo');
    await page.getByRole('button', { name: 'Ustaw kod PIN' }).click();
    await page.getByLabel('Nowy kod PIN').fill('4821');
    await page.getByLabel('Powtórz kod PIN').fill('4821');
    await page.getByRole('button', { name: 'Zapisz kod PIN' }).click();
    await page.getByRole('switch', { name: 'Blokada aplikacji' }).click();
    await expect(page.getByRole('switch', { name: 'Blokada aplikacji' })).toHaveAttribute('aria-checked', 'true');

    await page.reload();
    await expect(page.getByText('Aplikacja jest zablokowana')).toBeVisible();
    // zawartość aplikacji nie jest widoczna za blokadą
    await expect(page.getByRole('heading', { name: 'Bezpieczeństwo' })).toHaveCount(0);

    await page.getByLabel('Kod PIN').fill('0000');
    await page.getByRole('button', { name: 'Odblokuj' }).click();
    await expect(page.getByText('Nieprawidłowy kod PIN.')).toBeVisible();

    await page.getByLabel('Kod PIN').fill('4821');
    await page.getByRole('button', { name: 'Odblokuj' }).click();
    // po odblokowaniu wracamy na ekran, na którym byliśmy
    await expect(page.getByRole('heading', { name: 'Bezpieczeństwo' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Aplikacja jest zablokowana')).toHaveCount(0);
  });

  test('blokuje się po wyjściu z aplikacji na ustawiony czas', async ({ page }) => {
    await page.goto('/#/ustawienia/bezpieczenstwo');
    await page.getByRole('button', { name: 'Ustaw kod PIN' }).click();
    await page.getByLabel('Nowy kod PIN').fill('1234');
    await page.getByLabel('Powtórz kod PIN').fill('1234');
    await page.getByRole('button', { name: 'Zapisz kod PIN' }).click();
    await page.getByRole('switch', { name: 'Blokada aplikacji' }).click();
    await page.getByRole('button', { name: 'Od razu' }).click();

    // symulacja przejścia aplikacji w tło i powrotu
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByText('Aplikacja jest zablokowana')).toBeVisible();
  });
});
