import type { Artwork, Basis, Category, Currency, Location, Status } from '../../db/types';
import type { ArtworkInput } from '../../db/artworks';
import { FIELDS, type FieldKey, type Mapping } from './fields';
import type { Table } from './readTable';
import {
  norm,
  parseAmount,
  parseBasis,
  parseCategory,
  parseDate,
  parseDimensions,
  parseLocation,
  parseStatus,
  parseYear,
} from './normalize';

export interface ImportOptions {
  /** Kolejność liczb w kolumnie „Wymiary”: szerokość × wysokość albo wysokość × szerokość. */
  dimensionOrder: 'wh' | 'hw';
  /** Pomijaj dzieła, które już są w katalogu (taki sam tytuł i artysta). */
  skipDuplicates: boolean;
  /** Waluta, gdy w pliku nie ma kolumny „Waluta” ani symbolu przy cenie. */
  defaultCurrency: Currency;
}

export const DEFAULT_OPTIONS: ImportOptions = { dimensionOrder: 'wh', skipDuplicates: true, defaultCurrency: 'PLN' };

export const PLACEHOLDER_TITLE = '(bez tytułu)';
export const PLACEHOLDER_ARTIST = '(brak artysty)';

/** Pola wymagane, których brakuje: rekord trafia do katalogu z oznaczeniem „do uzupełnienia”. */
export type MissingField = 'title' | 'artist' | 'dimensions' | 'salePrice';
export const MISSING_LABELS: Record<MissingField, string> = {
  title: 'tytuł',
  artist: 'artysta',
  dimensions: 'wymiary',
  salePrice: 'cena sprzedaży',
};

export interface PlannedRow {
  line: number;
  status: 'ready' | 'incomplete' | 'duplicate';
  input: ArtworkInput;
  missing: MissingField[];
  /** Ostrzeżenia, np. nierozpoznana kategoria (użyto domyślnej). */
  warnings: string[];
  oldInvNo?: string;
  purchasePrice?: number;
  minPrice?: number;
}

export interface ImportPlan {
  rows: PlannedRow[];
  ready: number;
  incomplete: number;
  duplicates: number;
}

/** Klucz do wykrywania duplikatów: tytuł + artysta bez wielkości liter i polskich znaków. */
export const duplicateKey = (title: string, artist: string) => `${norm(title)}|${norm(artist)}`;

function planRow(
  cells: string[],
  mapping: Mapping,
  options: ImportOptions,
  line: number,
  existingKeys: Set<string>,
): PlannedRow {
  const get = (key: FieldKey): string => {
    const i = mapping[key];
    return i === undefined ? '' : (cells[i] ?? '').trim();
  };
  const warnings: string[] = [];
  const missing: MissingField[] = [];

  const title = get('title');
  const artist = get('artist');
  if (!title) missing.push('title');
  if (!artist) missing.push('artist');

  // wymiary: osobne kolumny albo jedna kolumna „Wymiary”
  let w: number | undefined;
  let h: number | undefined;
  let d: number | undefined;
  const separate = { w: parseAmount(get('width')).value, h: parseAmount(get('height')).value, d: parseAmount(get('depth')).value };
  if (separate.w && separate.h) {
    [w, h, d] = [separate.w, separate.h, separate.d];
  } else if (get('dimensions')) {
    const dim = parseDimensions(get('dimensions'));
    if (dim) {
      [w, h] = options.dimensionOrder === 'wh' ? [dim.a, dim.b] : [dim.b, dim.a];
      d = dim.c;
    } else warnings.push(`Nie rozpoznano wymiarów „${get('dimensions')}”`);
  }
  if (!(w && h && w > 0 && h > 0)) missing.push('dimensions');

  // cena i waluta
  const priceCell = parseAmount(get('salePrice'));
  const currencyCell = get('currency');
  let currency: Currency = options.defaultCurrency;
  if (/€|eur/i.test(currencyCell)) currency = 'EUR';
  else if (/zł|zl|pln/i.test(currencyCell)) currency = 'PLN';
  else if (priceCell.currency) currency = priceCell.currency;
  else if (currencyCell) warnings.push(`Nierozpoznana waluta „${currencyCell}” — użyto ${options.defaultCurrency}`);
  if (priceCell.value === undefined || priceCell.value < 0) {
    missing.push('salePrice');
    if (get('salePrice')) warnings.push(`Nie rozpoznano ceny „${get('salePrice')}”`);
  }

  const categoryText = get('category');
  let category: Category = 'malarstwo';
  if (categoryText) {
    const parsed = parseCategory(categoryText);
    if (parsed) category = parsed;
    else warnings.push(`Nierozpoznana kategoria „${categoryText}” — użyto: Malarstwo`);
  }

  let status: Status = 'dostepne';
  const statusText = get('status');
  if (statusText) {
    const parsed = parseStatus(statusText);
    if (parsed) status = parsed;
    else warnings.push(`Nierozpoznany status „${statusText}” — użyto: Dostępne`);
  }
  let reservation: Artwork['reservation'];
  if (status === 'zarezerwowane') {
    const until = parseDate(get('reservationUntil'));
    if (until) reservation = { until };
    else {
      status = 'dostepne';
      warnings.push('Rezerwacja bez daty — ustawiono status Dostępne (rezerwacja wymaga daty)');
    }
  }

  const location: Location = parseLocation(get('location')) ?? (status === 'w_magazynie' ? 'magazyn' : 'sala_wystawowa');
  if (get('location') && !parseLocation(get('location'))) warnings.push(`Nierozpoznana lokalizacja „${get('location')}”`);
  const basis: Basis = parseBasis(get('basis')) ?? 'wlasnosc';

  const oldInvNo = get('oldInvNo') || undefined;
  let description = get('description');
  if (oldInvNo) description = [description, `Nr z poprzedniego programu: ${oldInvNo}`].filter(Boolean).join('\n');

  const weight = parseAmount(get('weightKg')).value;
  const input: ArtworkInput = {
    title: title || PLACEHOLDER_TITLE,
    artist: artist || PLACEHOLDER_ARTIST,
    year: parseYear(get('year')),
    category,
    technique: get('technique') || undefined,
    material: get('material') || undefined,
    dimensionsCm: { w: w && w > 0 ? w : 0, h: h && h > 0 ? h : 0, d: d && d > 0 ? d : undefined },
    weightKg: weight && weight > 0 ? weight : undefined,
    edition: get('edition') || undefined,
    description: description || undefined,
    basis,
    status,
    location,
    reservation,
    salePrice: priceCell.value !== undefined && priceCell.value >= 0 ? priceCell.value : 0,
    currency,
  };

  const key = duplicateKey(title, artist);
  const isDuplicate = options.skipDuplicates && !!title && !!artist && existingKeys.has(key);
  if (title && artist) existingKeys.add(key);

  return {
    line,
    status: isDuplicate ? 'duplicate' : missing.length > 0 ? 'incomplete' : 'ready',
    input,
    missing,
    warnings,
    oldInvNo,
    purchasePrice: parseAmount(get('purchasePrice')).value,
    minPrice: parseAmount(get('minPrice')).value,
  };
}

/**
 * Układa plan importu: dla każdego wiersza ustala dane dzieła, braki i ostrzeżenia.
 * `existing` to tytuły i artyści dzieł już będących w katalogu (do pomijania duplikatów).
 */
export function buildPlan(
  table: Table,
  mapping: Mapping,
  options: ImportOptions,
  existing: { title: string; artist: string }[],
): ImportPlan {
  const keys = new Set(existing.map((e) => duplicateKey(e.title, e.artist)));
  const rows = table.rows.map((r) => planRow(r.cells, mapping, options, r.line, keys));
  return {
    rows,
    ready: rows.filter((r) => r.status === 'ready').length,
    incomplete: rows.filter((r) => r.status === 'incomplete').length,
    duplicates: rows.filter((r) => r.status === 'duplicate').length,
  };
}

/** Czy mapowanie wystarcza, by cokolwiek zaimportować (przynajmniej tytuł albo artysta). */
export function mappingProblems(mapping: Mapping): string[] {
  const problems: string[] = [];
  if (mapping.title === undefined && mapping.artist === undefined) {
    problems.push('Wskaż przynajmniej kolumnę z tytułem albo z artystą.');
  }
  return problems;
}

/** Które wymagane pola nie mają przypisanej kolumny (rekordy dostaną „do uzupełnienia”). */
export function unmappedRequired(mapping: Mapping): string[] {
  const out: string[] = [];
  const m = (k: FieldKey) => mapping[k] !== undefined;
  for (const f of FIELDS) {
    if (!f.required || f.key === 'dimensions') continue;
    if (!m(f.key)) out.push(f.label);
  }
  if (!m('dimensions') && !(m('width') && m('height'))) out.push('Wymiary');
  return out;
}
