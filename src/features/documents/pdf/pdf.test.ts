import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import type { Artwork } from '../../../db/types';
import { buildArtworkCardPdf } from './artworkCard';
import { createPdf, type PdfAssets } from './common';
import { buildInventoryListPdf, inventoryGroups } from './inventoryList';
import { buildLabelSheetPdf, LABELS_PER_SHEET } from './labelSheet';
import { buildPriceListPdf } from './priceList';

// Uint8Array.from: bufor z Node'a nie przechodzi kontroli typu w pdf-lib pod jsdom.
const bytes = (path: string) => Uint8Array.from(readFileSync(path));
const font = (name: string) => bytes(`node_modules/@expo-google-fonts/noto-sans/${name}/NotoSans_${name}.ttf`);
const assets: PdfAssets = {
  regular: font('400Regular'),
  bold: font('700Bold'),
  logo: bytes('src/assets/sztukafe-logo-black.png'),
};

const POLISH = 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ';

function art(over: Partial<Artwork> = {}): Artwork {
  return {
    id: 'x',
    invNo: 'SZK-2026-0001',
    invNoProvisional: false,
    title: `Zażółć gęślą jaźń ${POLISH}`,
    artist: 'Łukasz Żółkiewski',
    year: 2021,
    category: 'malarstwo',
    technique: 'olej na płótnie',
    dimensionsCm: { w: 60, h: 80, d: 4 },
    basis: 'wlasnosc',
    status: 'dostepne',
    location: 'sala_wystawowa',
    salePrice: 12500.5,
    currency: 'PLN',
    description: 'Długi opis dzieła. '.repeat(60),
    photoIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    createdBy: 'a',
    updatedBy: 'a',
    ...over,
  };
}

const pages = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();
const isPdf = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';

describe('czcionka PDF', () => {
  it('zawiera wszystkie polskie znaki (nic nie jest zamieniane na „?”)', async () => {
    const ctx = await createPdf(assets, 'test');
    expect(ctx.safe(POLISH, ctx.regular)).toBe(POLISH);
    expect(ctx.safe(POLISH, ctx.bold)).toBe(POLISH);
    expect(ctx.safe('1 234,50 zł €', ctx.regular)).toBe('1 234,50 zł €');
  });

  it('nieznany znak (np. emotikona) nie psuje dokumentu', async () => {
    const ctx = await createPdf(assets, 'test');
    expect(ctx.safe('A😀B', ctx.regular)).toBe('A??B'.replace('??', '?'.repeat(Array.from('😀').length)));
  });
});

describe('karta dzieła', () => {
  it('tworzy jednostronicowy A4 w wersji dla klienta i wewnętrznej', async () => {
    const client = await buildArtworkCardPdf(assets, art(), undefined, { kind: 'client' });
    const internal = await buildArtworkCardPdf(assets, art(), undefined, {
      kind: 'internal',
      purchasePrice: 4000,
      minPrice: 10000,
    });
    expect(isPdf(client) && isPdf(internal)).toBe(true);
    expect(await pages(client)).toBe(1);
    expect(await pages(internal)).toBe(1);
    const doc = await PDFDocument.load(client);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(595.28, 1);
    expect(internal.length).not.toBe(client.length); // wersja wewnętrzna ma więcej treści
  });
});

describe('cennik', () => {
  it('dzieli długą listę na strony', async () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ artwork: art({ id: String(i), invNo: `SZK-2026-${i}` }) }));
    const pdf = await buildPriceListPdf(assets, items, 'Wszystkie');
    expect(await pages(pdf)).toBeGreaterThan(1);
    expect(await pages(await buildPriceListPdf(assets, items.slice(0, 3), 'Dostępne'))).toBe(1);
  });

  it('pusty cennik też jest poprawnym PDF', async () => {
    const pdf = await buildPriceListPdf(assets, [], 'Zarezerwowane');
    expect(await pages(pdf)).toBe(1);
  });
});

describe('etykiety', () => {
  it('mieści 8 etykiet 10 × 7 cm na arkuszu, kolejne idą na następny', async () => {
    const spec = (i: number) => ({ artwork: art({ id: String(i) }), showPrice: i % 2 === 0 });
    expect(LABELS_PER_SHEET).toBe(8);
    expect(await pages(await buildLabelSheetPdf(assets, [spec(1), spec(2), spec(3)]))).toBe(1);
    expect(await pages(await buildLabelSheetPdf(assets, Array.from({ length: 8 }, (_, i) => spec(i))))).toBe(1);
    expect(await pages(await buildLabelSheetPdf(assets, Array.from({ length: 9 }, (_, i) => spec(i))))).toBe(2);
  });
});

describe('lista inwentaryzacyjna', () => {
  const set = [
    art({ id: '1', invNo: 'SZK-2026-0002', location: 'magazyn' }),
    art({ id: '2', invNo: 'SZK-2026-0001', location: 'sala_wystawowa' }),
    art({ id: '3', invNo: 'SZK-2026-0003', location: 'sala_wystawowa', status: 'sprzedane' }),
    art({ id: '4', invNo: 'SZK-2026-0004', location: 'sala_wystawowa', deleted: true }),
    art({ id: '5', invNo: 'SZK-2026-0000', location: 'sala_wystawowa' }),
  ];

  it('grupuje według lokalizacji, pomija sprzedane i usunięte, sortuje po numerze', () => {
    const groups = inventoryGroups(set);
    expect(groups.map((g) => [g.location, g.items.map((a) => a.id)])).toEqual([
      ['sala_wystawowa', ['5', '2']],
      ['magazyn', ['1']],
    ]);
  });

  it('tworzy PDF, także dla wielu stron', async () => {
    expect(await pages(await buildInventoryListPdf(assets, set))).toBe(1);
    const many = Array.from({ length: 80 }, (_, i) => art({ id: String(i), invNo: `SZK-2026-${1000 + i}` }));
    expect(await pages(await buildInventoryListPdf(assets, many))).toBeGreaterThan(1);
  });
});
