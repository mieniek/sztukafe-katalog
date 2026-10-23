import { db } from '../../db/db';
import { getLabelQueue } from '../../db/labelQueue';
import { getStoredRate } from '../../db/rates';
import { filterAndSort, describeFilters, type ListFilters } from '../artworks/listFilters';
import { formatDate } from '../../lib/format';
import { buildArtworkCardPdf, type CardVariant } from './pdf/artworkCard';
import { buildCatalogCsv, buildCatalogXlsx } from './exports/catalogExport';
import { buildShopifyCsv } from './exports/shopifyExport';
import { loadPdfAssets } from './pdf/assets';
import { buildInventoryListPdf, inventoryGroups } from './pdf/inventoryList';
import { buildLabelSheetPdf, type LabelSpec } from './pdf/labelSheet';
import { buildPriceListPdf } from './pdf/priceList';
import { safeFileName, type FileKind } from './share';

export interface GeneratedFile {
  bytes: Uint8Array;
  /** Nazwa bez rozszerzenia. */
  fileName: string;
  title: string;
  kind?: FileKind;
}

/** @deprecated dawna nazwa; plik może być też CSV albo XLSX. */
export type GeneratedPdf = GeneratedFile;

async function photoBytes(photoId: string | undefined, prefer: 'original' | 'thumb'): Promise<Uint8Array | undefined> {
  if (!photoId) return undefined;
  const photo = await db.photos.get(photoId);
  const blob = prefer === 'original' ? (photo?.original ?? photo?.thumb) : photo?.thumb;
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
}

const today = () => formatDate(new Date().toISOString()).split('.').reverse().join('-');

/** Karta dzieła. Wersja „internal” (z cenami wewnętrznymi) tylko dla admina — pracownik jej nie dostanie. */
export async function createCardPdf(
  artworkId: string,
  kind: CardVariant['kind'],
  isAdmin: boolean,
): Promise<GeneratedPdf> {
  const artwork = await db.artworks.get(artworkId);
  if (!artwork || artwork.deleted) throw new Error('Nie znaleziono dzieła.');
  let variant: CardVariant = { kind: 'client' };
  if (kind === 'internal') {
    if (!isAdmin) throw new Error('Wersja wewnętrzna jest tylko dla admina.');
    const prices = await db.prices.get(artworkId);
    variant = { kind: 'internal', purchasePrice: prices?.purchasePrice, minPrice: prices?.minPrice };
  }
  const [assets, photo] = await Promise.all([loadPdfAssets(), photoBytes(artwork.photoIds[0], 'original')]);
  const bytes = await buildArtworkCardPdf(assets, artwork, photo, variant);
  const suffix = kind === 'internal' ? '-wewnetrzna' : '';
  return {
    bytes,
    title: `${artwork.title} — ${artwork.artist}`,
    fileName: `Karta-${artwork.invNo}-${safeFileName(artwork.title)}${suffix}`,
  };
}

/** Cennik z tymi samymi filtrami co katalog. Nigdy nie zawiera cen wewnętrznych. */
export async function createPriceListPdf(filters: ListFilters): Promise<GeneratedPdf> {
  const rate = (await getStoredRate())?.rate;
  const artworks = filterAndSort(await db.artworks.toArray(), filters, rate);
  const assets = await loadPdfAssets();
  const items = [];
  for (const artwork of artworks) items.push({ artwork, thumb: await photoBytes(artwork.photoIds[0], 'thumb') });
  const bytes = await buildPriceListPdf(assets, items, describeFilters(filters));
  return { bytes, title: 'Cennik SztuKaFe', fileName: `Cennik-${today()}` };
}

export async function createInventoryPdf(): Promise<GeneratedPdf> {
  const artworks = await db.artworks.toArray();
  const bytes = await buildInventoryListPdf(await loadPdfAssets(), artworks);
  return { bytes, title: 'Lista inwentaryzacyjna', fileName: `Inwentaryzacja-${today()}` };
}

export async function inventoryCount(): Promise<number> {
  return inventoryGroups(await db.artworks.toArray()).reduce((n, g) => n + g.items.length, 0);
}

/** Arkusz A4 z etykietami z kolejki albo (gdy podano `only`) z jedną etykietą. */
export async function createLabelsPdf(only?: LabelSpecInput): Promise<GeneratedPdf> {
  const queue = only ? [only] : await getLabelQueue();
  const specs: LabelSpec[] = [];
  for (const q of queue) {
    const artwork = await db.artworks.get(q.artworkId);
    if (artwork && !artwork.deleted) specs.push({ artwork, showPrice: q.showPrice });
  }
  if (specs.length === 0) throw new Error('Arkusz nie ma jeszcze żadnych etykiet.');
  const bytes = await buildLabelSheetPdf(await loadPdfAssets(), specs);
  return { bytes, title: 'Etykiety ścienne', fileName: `Etykiety-${today()}` };
}

export interface LabelSpecInput {
  artworkId: string;
  showPrice: boolean;
}

/** Ceny wewnętrzne trafiają do eksportu tylko u admina; u pracownika tabela cen jest zawsze pomijana. */
async function exportInputs(isAdmin: boolean) {
  const artworks = await db.artworks.toArray();
  const prices = new Map(isAdmin ? (await db.prices.toArray()).map((p) => [p.id, p]) : []);
  return { artworks, prices, opts: { includePrivate: isAdmin } };
}

export async function createCatalogCsv(isAdmin: boolean): Promise<GeneratedFile> {
  const { artworks, prices, opts } = await exportInputs(isAdmin);
  return { bytes: buildCatalogCsv(artworks, prices, opts), fileName: `Katalog-${today()}`, title: 'Katalog SztuKaFe (CSV)', kind: 'csv' };
}

export async function createCatalogXlsx(isAdmin: boolean): Promise<GeneratedFile> {
  const { artworks, prices, opts } = await exportInputs(isAdmin);
  return {
    bytes: await buildCatalogXlsx(artworks, prices, opts),
    fileName: `Katalog-${today()}`,
    title: 'Katalog SztuKaFe (XLSX)',
    kind: 'xlsx',
  };
}

export async function createShopifyCsv(): Promise<GeneratedFile> {
  const rate = (await getStoredRate())?.rate;
  const { csv, count } = buildShopifyCsv(await db.artworks.toArray(), rate);
  if (count === 0) throw new Error('Brak dzieł ze statusem „Dostępne” do wyeksportowania.');
  return { bytes: csv, fileName: `Shopify-produkty-${today()}`, title: 'Produkty do sklepu Shopify', kind: 'csv' };
}

export async function availableCount(): Promise<number> {
  return (await db.artworks.toArray()).filter((a) => !a.deleted && a.status === 'dostepne').length;
}
