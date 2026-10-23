import Papa from 'papaparse';
import type { Artwork } from '../../../db/types';
import { formatDimensions } from '../../../lib/format';
import { CATEGORY_LABELS } from '../../../lib/labels';
import { toPln } from '../../../lib/nbp';
import { norm } from '../../import/normalize';

export class ShopifyExportError extends Error {}

/**
 * Nagłówki szablonu importu produktów Shopify (starszy układ „Handle / Variant …” — Shopify nadal go przyjmuje
 * i jest dokumentowany od lat). Kolejność jak w oficjalnym pliku wzorcowym.
 */
export const SHOPIFY_HEADERS = [
  'Handle',
  'Title',
  'Body (HTML)',
  'Vendor',
  'Type',
  'Tags',
  'Published',
  'Option1 Name',
  'Option1 Value',
  'Variant SKU',
  'Variant Grams',
  'Variant Inventory Tracker',
  'Variant Inventory Qty',
  'Variant Inventory Policy',
  'Variant Fulfillment Service',
  'Variant Price',
  'Variant Requires Shipping',
  'Variant Taxable',
  'Variant Weight Unit',
  'Image Src',
  'Image Position',
  'Image Alt Text',
  'Gift Card',
  'Status',
] as const;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Adres produktu: tytuł + artysta + numer inwentarzowy (numer gwarantuje unikalność). */
export function shopifyHandle(a: Artwork): string {
  return `${norm(a.title)} ${norm(a.artist)} ${norm(a.invNo)}`.trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200);
}

function bodyHtml(a: Artwork): string {
  const lines: string[] = [`<p><strong>${escapeHtml(a.artist)}</strong>${a.year ? `, ${a.year}` : ''}</p>`];
  const details = [
    ['Kategoria', CATEGORY_LABELS[a.category]],
    ['Technika', a.technique],
    ['Materiał', a.material],
    ['Wymiary', formatDimensions(a.dimensionsCm)],
    ['Edycja', a.edition],
  ].filter(([, v]) => v);
  if (details.length) {
    lines.push(`<ul>${details.map(([k, v]) => `<li>${k}: ${escapeHtml(String(v))}</li>`).join('')}</ul>`);
  }
  if (a.description) lines.push(`<p>${escapeHtml(a.description).replace(/\n/g, '<br>')}</p>`);
  return lines.join('');
}

export interface ShopifyExport {
  csv: Uint8Array;
  count: number;
}

/**
 * Eksport do sklepu: tylko dzieła ze statusem „Dostępne”, każde jako produkt w 1 sztuce.
 * Produkty trafiają do Shopify jako szkice (Status: draft), żeby właściciel mógł je przejrzeć przed publikacją.
 * Ceny w EUR są przeliczane na złote po kursie NBP (sklep rozlicza w jednej walucie); bez kursu eksport się nie uda.
 * Zdjęcia nie są eksportowane (nie mają publicznych adresów) — dodaje się je w Shopify.
 */
export function buildShopifyCsv(artworks: Artwork[], eurRate?: number): ShopifyExport {
  const items = artworks
    .filter((a) => !a.deleted && a.status === 'dostepne')
    .sort((a, b) => a.invNo.localeCompare(b.invNo));
  if (items.some((a) => a.currency === 'EUR') && !eurRate) {
    throw new ShopifyExportError('Część dzieł ma ceny w euro, a kurs NBP nie jest znany. Pobierz kurs w Ustawieniach → Kurs EUR i spróbuj ponownie.');
  }
  const data = items.map((a) => {
    const price = toPln(a.salePrice, a.currency, eurRate)!;
    return [
      shopifyHandle(a),
      a.title,
      bodyHtml(a),
      a.artist,
      CATEGORY_LABELS[a.category],
      [CATEGORY_LABELS[a.category], a.artist].join(', '),
      'FALSE',
      'Title',
      'Default Title',
      a.invNo,
      a.weightKg ? Math.round(a.weightKg * 1000) : '',
      'shopify',
      1,
      'deny',
      'manual',
      price.toFixed(2),
      'TRUE',
      'TRUE',
      'kg',
      '',
      '',
      '',
      'FALSE',
      'draft',
    ];
  });
  const text = Papa.unparse({ fields: [...SHOPIFY_HEADERS], data }, { delimiter: ',', newline: '\r\n' });
  return { csv: new TextEncoder().encode(text), count: items.length };
}
