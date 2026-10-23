import { expect, test } from '@playwright/test';
import { addArtwork } from './support/app';

test.describe('iPad', () => {
  test('katalog pokazuje siatkę kafli (≥ 768 px), a nie listę jak na telefonie', async ({ page }) => {
    await addArtwork(page, { title: 'Dzieło na iPada', artist: 'Anna Nowak' });
    await page.goto('/#/katalog');
    const display = await page.evaluate(() => {
      const lists = [...document.querySelectorAll('ul')].filter((ul) => ul.querySelector('a[href*="dzielo"]'));
      return lists.map((ul) => getComputedStyle(ul).display);
    });
    expect(display).toContain('grid');
    expect(display).toContain('none'); // lista dla telefonu jest ukryta
    await expect(page.getByText('Dzieło na iPada').filter({ visible: true }).first()).toBeVisible();
  });

  test('kreator, karta i dokumenty mieszczą się bez poziomego przewijania', async ({ page }) => {
    for (const path of ['/#/', '/#/katalog', '/#/dokumenty', '/#/ustawienia', '/#/nowe']) {
      await page.goto(path);
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `przepełnienie poziome na ${path}`).toBeLessThanOrEqual(0);
    }
  });
});
