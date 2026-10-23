import Papa from 'papaparse';
import type { Artwork, PrivatePrices } from '../../../db/types';
import { autoMap } from '../../import/fields';
import { DEFAULT_OPTIONS, buildPlan } from '../../import/plan';
import { decodeText, parseCsv } from '../../import/readTable';
import { buildCatalogCsv, catalogTable } from './catalogExport';
import { ShopifyExportError, SHOPIFY_HEADERS, buildShopifyCsv, shopifyHandle } from './shopifyExport';

function art(over: Partial<Artwork> = {}): Artwork {
  return {
    id: 'a1',
    invNo: 'SZK-2026-0001',
    invNoProvisional: false,
    title: 'Zażółć gęślą "jaźń"; test',
    artist: 'Łukasz Żółkiewski',
    year: 2021,
    category: 'malarstwo',
    technique: 'olej, płótno',
    dimensionsCm: { w: 60, h: 80.5, d: 4 },
    weightKg: 6.4,
    basis: 'komis',
    status: 'dostepne',
    location: 'sala_wystawowa',
    salePrice: 12500.5,
    currency: 'PLN',
    description: 'Opis z <znakami> & nową linią\ndruga linia',
    photoIds: [],
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-02-01T10:00:00Z',
    createdBy: 'a@x.pl',
    updatedBy: 'a@x.pl',
    ...over,
  };
}

const prices = new Map<string, PrivatePrices>([['a1', { id: 'a1', purchasePrice: 4000, minPrice: 10000, updatedAt: '' }]]);

describe('eksport katalogu CSV', () => {
  it('zawiera ceny wewnętrzne tylko dla admina', () => {
    const admin = decodeText(buildCatalogCsv([art()], prices, { includePrivate: true }));
    const staff = decodeText(buildCatalogCsv([art()], prices, { includePrivate: false }));
    expect(admin).toContain('Cena zakupu');
    expect(admin).toContain('4000');
    expect(staff).not.toContain('Cena zakupu');
    expect(staff).not.toContain('Cena minimalna');
    expect(staff).not.toContain('4000');
    expect(staff).not.toContain('10000');
  });

  it('nawet gdy ktoś poda tabelę cen, pracownik jej nie dostaje', () => {
    const { headers, rows } = catalogTable([art()], prices, { includePrivate: false });
    expect(headers).not.toContain('Cena zakupu');
    expect(rows[0]).not.toContain(4000);
  });

  it('używa UTF-8 z BOM, średnika i przecinka dziesiętnego; pomija usunięte', () => {
    const bytes = buildCatalogCsv([art(), art({ id: 'b', invNo: 'SZK-2026-0002', deleted: true })], new Map(), { includePrivate: false });
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = decodeText(bytes);
    expect(text.split('\r\n').filter(Boolean)).toHaveLength(2);
    expect(text).toContain('12500,5');
    expect(text).toContain('80,5');
    expect(text).toContain('Łukasz Żółkiewski');
  });

  it('eksport da się wczytać z powrotem importerem — bez ręcznej edycji i bez utraty danych', () => {
    const original = [
      art(),
      art({ id: 'b', invNo: 'SZK-2026-0002', title: 'Drugie', artist: 'Anna', status: 'zarezerwowane', reservation: { until: '2026-11-30', note: 'Pani Ewa' }, currency: 'EUR', salePrice: 900, category: 'rzezba', basis: 'wlasnosc', location: 'magazyn' }),
    ];
    const csv = decodeText(buildCatalogCsv(original, prices, { includePrivate: true }));
    const table = parseCsv(csv);
    const mapping = autoMap(table.headers);
    const plan = buildPlan(table, mapping, DEFAULT_OPTIONS, []);
    expect(plan.ready).toBe(2);
    const [first, second] = plan.rows;
    expect(first.input).toMatchObject({
      title: 'Zażółć gęślą "jaźń"; test',
      artist: 'Łukasz Żółkiewski',
      year: 2021,
      category: 'malarstwo',
      technique: 'olej, płótno',
      dimensionsCm: { w: 60, h: 80.5, d: 4 },
      weightKg: 6.4,
      basis: 'komis',
      salePrice: 12500.5,
      currency: 'PLN',
    });
    expect(first.purchasePrice).toBe(4000);
    expect(first.minPrice).toBe(10000);
    expect(second.input).toMatchObject({
      status: 'zarezerwowane',
      reservation: { until: '2026-11-30' },
      currency: 'EUR',
      category: 'rzezba',
      location: 'magazyn',
    });
  });
});

describe('eksport do sklepu (Shopify)', () => {
  const parse = (bytes: Uint8Array) => Papa.parse<Record<string, string>>(decodeText(bytes), { header: true, skipEmptyLines: true });

  it('zawiera tylko dzieła „Dostępne” i nagłówki szablonu Shopify', () => {
    const { csv, count } = buildShopifyCsv([
      art(),
      art({ id: 'b', invNo: 'SZK-2026-0002', status: 'sprzedane' }),
      art({ id: 'c', invNo: 'SZK-2026-0003', status: 'zarezerwowane' }),
      art({ id: 'd', invNo: 'SZK-2026-0004', status: 'w_magazynie' }),
      art({ id: 'e', invNo: 'SZK-2026-0005', deleted: true }),
    ]);
    expect(count).toBe(1);
    const parsed = parse(csv);
    expect(parsed.meta.fields).toEqual([...SHOPIFY_HEADERS]);
    expect(parsed.data).toHaveLength(1);
  });

  it('wypełnia pola produktu: SKU, cena, waga, szkic, 1 sztuka, bezpieczny HTML', () => {
    const [row] = parse(buildShopifyCsv([art()]).csv).data;
    expect(row['Variant SKU']).toBe('SZK-2026-0001');
    expect(row['Variant Price']).toBe('12500.50');
    expect(row['Variant Grams']).toBe('6400');
    expect(row['Variant Inventory Qty']).toBe('1');
    expect(row.Status).toBe('draft');
    expect(row.Vendor).toBe('Łukasz Żółkiewski');
    expect(row.Title).toBe('Zażółć gęślą "jaźń"; test');
    expect(row['Body (HTML)']).toContain('&lt;znakami&gt; &amp; nową linią<br>druga linia');
    expect(row['Body (HTML)']).toContain('Wymiary: 60 × 80,5 × 4 cm');
    expect(row['Body (HTML)']).not.toContain('<znakami>');
    expect(row.Handle).toMatch(/^[a-z0-9-]+$/);
    expect(row.Handle).toContain('szk-2026-0001');
  });

  it('przelicza EUR na złote po kursie, a bez kursu zgłasza czytelny błąd', () => {
    const eur = art({ currency: 'EUR', salePrice: 1000 });
    expect(parse(buildShopifyCsv([eur], 4.3685).csv).data[0]['Variant Price']).toBe('4368.50');
    expect(() => buildShopifyCsv([eur])).toThrow(ShopifyExportError);
    expect(() => buildShopifyCsv([eur])).toThrow(/kurs/i);
    // dzieła w PLN nie wymagają kursu
    expect(buildShopifyCsv([art()]).count).toBe(1);
  });

  it('adresy produktów są unikalne nawet dla tych samych tytułów', () => {
    const a = art({ invNo: 'SZK-2026-0001' });
    const b = art({ id: 'b', invNo: 'SZK-2026-0002' });
    expect(shopifyHandle(a)).not.toBe(shopifyHandle(b));
  });
});
