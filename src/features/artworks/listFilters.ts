import type { Artwork, Status } from '../../db/types';
import { STATUS_LABELS } from '../../lib/labels';
import { toPln } from '../../lib/nbp';
import { parseNumber } from './formValues';

export type SortKey = 'added_desc' | 'added_asc' | 'inv_asc' | 'price_asc' | 'price_desc';

export interface ListFilters {
  query: string;
  status: Status | '';
  priceFrom: string;
  priceTo: string;
  /** Tylko dzieła do uzupełnienia (braki z importu albo bez zdjęcia). */
  todo: boolean;
  sort: SortKey;
}

export const DEFAULT_FILTERS: ListFilters = {
  query: '',
  status: '',
  priceFrom: '',
  priceTo: '',
  todo: false,
  sort: 'added_desc',
};

/** Dzieło do uzupełnienia: ma braki z importu albo nie ma jeszcze żadnego zdjęcia. */
export const needsWork = (a: Artwork): boolean => !!a.needsCompletion?.length || a.photoIds.length === 0;

export const SORT_LABELS: Record<SortKey, string> = {
  added_desc: 'Od najnowszych',
  added_asc: 'Od najstarszych',
  inv_asc: 'Numer inwentarzowy',
  price_asc: 'Cena rosnąco',
  price_desc: 'Cena malejąco',
};

/** Małe litery, bez polskich znaków — „zolw” znajdzie „Żółw”. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Cena (filtr i sortowanie) liczona w złotych: dzieła w EUR przeliczamy po kursie NBP.
 * Gdy kursu jeszcze nie ma, porównujemy kwotę w walucie dzieła.
 */
export function filterAndSort(artworks: Artwork[], f: ListFilters, eurRate?: number): Artwork[] {
  const price = (a: Artwork) => toPln(a.salePrice, a.currency, eurRate) ?? a.salePrice;
  const q = normalizeText(f.query.trim());
  const from = parseNumber(f.priceFrom);
  const to = parseNumber(f.priceTo);

  const result = artworks.filter((a) => {
    if (a.deleted) return false;
    if (f.status && a.status !== f.status) return false;
    if (f.todo && !needsWork(a)) return false;
    if (q && !normalizeText(`${a.title} ${a.artist}`).includes(q)) return false;
    if (from !== undefined && !Number.isNaN(from) && price(a) < from) return false;
    if (to !== undefined && !Number.isNaN(to) && price(a) > to) return false;
    return true;
  });

  const by: Record<SortKey, (x: Artwork, y: Artwork) => number> = {
    added_desc: (x, y) => y.createdAt.localeCompare(x.createdAt),
    added_asc: (x, y) => x.createdAt.localeCompare(y.createdAt),
    inv_asc: (x, y) => x.invNo.localeCompare(y.invNo),
    price_asc: (x, y) => price(x) - price(y),
    price_desc: (x, y) => price(y) - price(x),
  };
  return result.sort(by[f.sort]);
}

export const FILTERS_KEY = 'katalog.filters';

/** Filtry katalogu zapamiętane na czas sesji — wspólne dla listy i dokumentów (cennik ma te same filtry). */
export function loadStoredFilters(): ListFilters {
  try {
    const raw = sessionStorage.getItem(FILTERS_KEY);
    return raw ? { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<ListFilters>) } : DEFAULT_FILTERS;
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function storeFilters(filters: ListFilters): void {
  try {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // tryb prywatny — filtry po prostu nie przetrwają odświeżenia
  }
}

/** Opis aktywnych filtrów, np. „Dostępne · szukaj: „kowalski” · cena 1000–5000 zł”. */
export function describeFilters(f: ListFilters): string {
  const parts: string[] = [f.status ? STATUS_LABELS[f.status] : 'Wszystkie'];
  if (f.todo) parts.push('do uzupełnienia');
  if (f.query.trim()) parts.push(`szukaj: „${f.query.trim()}”`);
  if (f.priceFrom || f.priceTo) parts.push(`cena ${f.priceFrom || '0'}–${f.priceTo || '∞'} zł`);
  return parts.join(' · ');
}
