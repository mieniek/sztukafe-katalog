import { expect, test } from '@playwright/test';
import { addArtwork, pickPhoto, visibleText, waitForOfflineReady } from './support/app';

test.describe('Kreator nowego dzieła (iPhone 15)', () => {
  test('dodaje dzieło z 3 zdjęciami offline w mniej niż 60 s i zachowuje je po ponownym otwarciu', async ({ page, context }) => {
    await page.goto('/');
    await waitForOfflineReady(page);

    // Prawdziwy tryb samolotowy: aplikacja musi się załadować z pamięci Service Workera.
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: /Dzień dobry/ })).toBeVisible();

    const started = Date.now();
    await addArtwork(page, { title: 'Zima w Krakowie', artist: 'Jan Kowalski', photos: 3, price: '12500' });
    const seconds = (Date.now() - started) / 1000;
    expect(seconds, `dodawanie trwało ${seconds.toFixed(1)} s`).toBeLessThan(60);

    // karta dzieła: tytuł, numer tymczasowy (offline), 3 zdjęcia
    await expect(page.getByRole('heading', { name: 'Zima w Krakowie' })).toBeVisible();
    await expect(page.getByText(/numer tymczasowy/)).toBeVisible();
    await expect(page.locator('ul[aria-label="Zdjęcia dzieła"] li')).toHaveCount(3);

    // zamknięcie i ponowne otwarcie aplikacji (nadal offline) — dane są
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto('/#/katalog');
    await expect(visibleText(reopened, 'Zima w Krakowie')).toBeVisible();
    await expect(visibleText(reopened, '12 500 zł')).toBeVisible();
  });

  test('nie pozwala zapisać bez wymaganych pól i podpowiada, czego brakuje', async ({ page }) => {
    await page.goto('/#/nowe');
    await expect(page.getByRole('heading', { name: 'Przód' })).toBeVisible();
    await pickPhoto(page, 'camera', 'Przod');
    await page.getByRole('button', { name: /Do danych/ }).click();
    await expect(page.getByText('Brakuje: tytuł, artysta, wymiary, cena')).toBeVisible();
    // przycisk ma aria-disabled (wygląda na nieaktywny, ale po stuknięciu mówi, czego brakuje)
    await page.getByRole('button', { name: 'Zapisz dzieło' }).click({ force: true });
    await expect(page).toHaveURL(/#\/nowe/); // zostaje w formularzu
    await expect(page.getByText(/Uzupełnij: tytuł/)).toBeVisible();
  });

  test('rezerwacja wymaga daty', async ({ page }) => {
    await addArtwork(page, { title: 'Rezerwowane', artist: 'Anna Nowak' });
    await page.getByRole('button', { name: 'Rezerw.' }).click();
    await page.getByRole('button', { name: 'Zarezerwuj' }).click();
    await expect(page.getByText('Rezerwacja wymaga daty, do kiedy obowiązuje.')).toBeVisible();
    await page.getByLabel('Rezerwacja do').fill('2030-01-31');
    await page.getByRole('button', { name: 'Zarezerwuj' }).click();
    await expect(page.getByText('Rezerwacja do 31.01.2030')).toBeVisible();
  });
});
