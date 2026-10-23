import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addArtwork } from './support/app';

/** Ekrany do sprawdzenia dostępności (kontrast, etykiety, role) i celów dotyku. */
const SCREENS: [string, string][] = [
  ['Pulpit', '/#/'],
  ['Katalog', '/#/katalog'],
  ['Dokumenty', '/#/dokumenty'],
  ['Ustawienia', '/#/ustawienia'],
  ['Synchronizacja', '/#/ustawienia/synchronizacja'],
  ['Kurs EUR', '/#/ustawienia/kurs'],
  ['Bezpieczeństwo', '/#/ustawienia/bezpieczenstwo'],
  ['Import', '/#/ustawienia/import'],
];

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

/** Elementy do dotknięcia mniejsze niż 44 × 44 px (pola dotyku powiększone pseudo-elementem liczymy jako 44). */
async function smallTargets(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=switch], [role=button]';
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || el.closest('[hidden]')) continue;
      if (el.classList.contains('visually-hidden')) continue;
      // chipy i pille mają niewidoczne powiększenie pola dotyku (::after wystające poza element)
      const after = getComputedStyle(el, '::after');
      const extra =
        after.content !== 'none' && after.position === 'absolute'
          ? -(parseFloat(after.top) || 0) - (parseFloat(after.bottom) || 0)
          : 0;
      const h = r.height + extra;
      // przełącznik ma pole dotyku powiększone o 8 px (box-shadow); liczymy go jako 44
      const sw = el.getAttribute('role') === 'switch' ? 16 : 0;
      if (r.width + sw < 44 - 0.5 || h + sw < 44 - 0.5) {
        out.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(h)}`);
      }
    }
    return out;
  });
}

test.describe('Dostępność', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Dzień dobry/ })).toBeVisible();
  });

  for (const [name, path] of SCREENS) {
    test(`ekran „${name}”: brak naruszeń WCAG 2.1 AA i cele dotyku ≥ 44 px`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(600);
      expect(await violations(page)).toEqual([]);
      expect(await smallTargets(page)).toEqual([]);
    });
  }

  test('formularz dzieła i karta dzieła', async ({ page }) => {
    await addArtwork(page, { title: 'Dostępne dzieło', artist: 'Jan Kowalski', purchase: '10', min: '20' });
    await page.waitForTimeout(600);
    expect(await violations(page)).toEqual([]);
    expect(await smallTargets(page)).toEqual([]);

    await page.getByRole('link', { name: 'Edytuj' }).click();
    await page.waitForTimeout(600);
    expect(await violations(page)).toEqual([]);
    expect(await smallTargets(page)).toEqual([]);
  });

  test('widoczny pierścień fokusu przy nawigacji klawiaturą (iPad z klawiaturą, Mac)', async ({ page }) => {
    await page.goto('/#/katalog');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return { tag: el.tagName, width: parseFloat(s.outlineWidth), style: s.outlineStyle };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test('pola tekstowe mają 16 px (iOS nie przybliża strony po dotknięciu)', async ({ page }) => {
    await page.goto('/#/katalog');
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([type=file]), select, textarea')]
        .map((el) => parseFloat(getComputedStyle(el).fontSize))
        .filter((s) => s < 16),
    );
    expect(small).toEqual([]);
  });
});
