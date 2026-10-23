import Papa from 'papaparse';
import type { Artwork, PrivatePrices } from '../../../db/types';
import { formatDate } from '../../../lib/format';
import { BASIS_LABELS, CATEGORY_LABELS, LOCATION_LABELS, STATUS_LABELS } from '../../../lib/labels';

type Cell = string | number | undefined;

interface Column {
  header: string;
  width: number;
  value: (a: Artwork, prices?: PrivatePrices) => Cell;
}

/**
 * Kolumny eksportu. Nagłówki są dobrane tak, by import rozpoznał je automatycznie
 * (eksport z aplikacji można wczytać z powrotem).
 */
function columns(includePrivate: boolean): Column[] {
  const base: Column[] = [
    { header: 'Numer inwentarzowy', width: 20, value: (a) => a.invNo },
    { header: 'Tytuł', width: 32, value: (a) => a.title },
    { header: 'Artysta', width: 26, value: (a) => a.artist },
    { header: 'Rok', width: 8, value: (a) => a.year },
    { header: 'Kategoria', width: 18, value: (a) => CATEGORY_LABELS[a.category] },
    { header: 'Technika', width: 24, value: (a) => a.technique },
    { header: 'Materiał / podłoże', width: 22, value: (a) => a.material },
    { header: 'Szerokość (cm)', width: 14, value: (a) => a.dimensionsCm.w },
    { header: 'Wysokość (cm)', width: 14, value: (a) => a.dimensionsCm.h },
    { header: 'Głębokość (cm)', width: 14, value: (a) => a.dimensionsCm.d },
    { header: 'Waga (kg)', width: 10, value: (a) => a.weightKg },
    { header: 'Edycja', width: 10, value: (a) => a.edition },
    { header: 'Opis', width: 50, value: (a) => a.description },
    { header: 'Podstawa', width: 16, value: (a) => BASIS_LABELS[a.basis] },
    { header: 'Status', width: 14, value: (a) => STATUS_LABELS[a.status] },
    { header: 'Lokalizacja', width: 16, value: (a) => LOCATION_LABELS[a.location] },
    { header: 'Rezerwacja do', width: 14, value: (a) => (a.reservation ? formatDate(a.reservation.until) : undefined) },
    { header: 'Rezerwacja — uwagi', width: 22, value: (a) => a.reservation?.note },
    { header: 'Cena sprzedaży', width: 14, value: (a) => a.salePrice },
    { header: 'Waluta', width: 8, value: (a) => a.currency },
  ];
  const priv: Column[] = includePrivate
    ? [
        { header: 'Cena zakupu', width: 14, value: (_a, p) => p?.purchasePrice },
        { header: 'Cena minimalna', width: 14, value: (_a, p) => p?.minPrice },
      ]
    : [];
  const tail: Column[] = [
    { header: 'Dodano', width: 12, value: (a) => formatDate(a.createdAt) },
    { header: 'Zmieniono', width: 12, value: (a) => formatDate(a.updatedAt) },
    { header: 'Dodał(a)', width: 24, value: (a) => a.createdBy },
    { header: 'Zmienił(a)', width: 24, value: (a) => a.updatedBy },
  ];
  return [...base, ...priv, ...tail];
}

const active = (artworks: Artwork[]) =>
  artworks.filter((a) => !a.deleted).sort((a, b) => a.invNo.localeCompare(b.invNo));

export interface CatalogExportOptions {
  /** Czy dołączyć ceny zakupu i minimalne — tylko dla admina; dla pracownika zawsze false. */
  includePrivate: boolean;
}

/** Tabela eksportu: nagłówki i wiersze (liczby jako liczby). Dzieła usunięte są pomijane. */
export function catalogTable(artworks: Artwork[], prices: Map<string, PrivatePrices>, opts: CatalogExportOptions) {
  const cols = columns(opts.includePrivate);
  return {
    headers: cols.map((c) => c.header),
    widths: cols.map((c) => c.width),
    rows: active(artworks).map((a) => cols.map((c) => c.value(a, opts.includePrivate ? prices.get(a.id) : undefined))),
  };
}

const encoder = new TextEncoder();

/** CSV po polsku: UTF-8 z BOM (Excel widzi polskie znaki), separator średnik, przecinek dziesiętny. */
export function buildCatalogCsv(artworks: Artwork[], prices: Map<string, PrivatePrices>, opts: CatalogExportOptions): Uint8Array {
  const { headers, rows } = catalogTable(artworks, prices, opts);
  const text = Papa.unparse(
    {
      fields: headers,
      data: rows.map((r) => r.map((c) => (typeof c === 'number' ? String(c).replace('.', ',') : (c ?? '')))),
    },
    { delimiter: ';', newline: '\r\n' },
  );
  return encoder.encode(`﻿${text}`);
}

/** XLSX: nagłówki pogrubione, liczby jako liczby, szerokości kolumn dopasowane. */
export async function buildCatalogXlsx(
  artworks: Artwork[],
  prices: Map<string, PrivatePrices>,
  opts: CatalogExportOptions,
): Promise<Uint8Array> {
  const { default: writeXlsx } = await import('write-excel-file/browser');
  const { headers, widths, rows } = catalogTable(artworks, prices, opts);
  const data = [
    headers.map((value) => ({ value, fontWeight: 'bold' as const })),
    ...rows.map((r) => r.map((c) => (c === undefined ? null : c))),
  ];
  const blob = await writeXlsx(data, { columns: widths.map((width) => ({ width })), sheet: 'Katalog' }).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}
