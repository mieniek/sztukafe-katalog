import type { Artwork, Basis, Category, Currency, Location, PrivatePrices, Status } from '../../db/types';
import type { ArtworkInput } from '../../db/artworks';

export const MAX_PHOTOS = 5;

/** Wartości pól formularza — liczby trzymamy jako tekst, żeby nie tracić tego, co użytkownik wpisuje. */
export interface FormValues {
  title: string;
  artist: string;
  year: string;
  category: Category;
  technique: string;
  material: string;
  w: string;
  h: string;
  d: string;
  weightKg: string;
  edition: string;
  description: string;
  basis: Basis;
  status: Status;
  location: Location;
  reservationUntil: string;
  reservationNote: string;
  salePrice: string;
  currency: Currency;
  /** Ceny wewnętrzne — wypełniane i widoczne tylko dla admina. */
  purchasePrice: string;
  minPrice: string;
}

export type FormErrors = Partial<Record<keyof FormValues | 'photos', string>>;

export function emptyForm(): FormValues {
  return {
    title: '',
    artist: '',
    year: '',
    category: 'malarstwo',
    technique: '',
    material: '',
    w: '',
    h: '',
    d: '',
    weightKg: '',
    edition: '',
    description: '',
    basis: 'wlasnosc',
    status: 'dostepne',
    location: 'sala_wystawowa',
    reservationUntil: '',
    reservationNote: '',
    salePrice: '',
    currency: 'PLN',
    purchasePrice: '',
    minPrice: '',
  };
}

const str = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

export function valuesFromArtwork(a: Artwork, prices?: PrivatePrices): FormValues {
  const v = baseValues(a, prices);
  // Rekord z importu: pola zastępcze („(bez tytułu)”, 0 zł…) pokazujemy jako puste, żeby trzeba je było uzupełnić.
  const missing = new Set(a.needsCompletion ?? []);
  if (missing.has('title')) v.title = '';
  if (missing.has('artist')) v.artist = '';
  if (missing.has('dimensions')) [v.w, v.h] = ['', ''];
  if (missing.has('salePrice')) v.salePrice = '';
  return v;
}

function baseValues(a: Artwork, prices?: PrivatePrices): FormValues {
  return {
    title: a.title,
    artist: a.artist,
    year: a.year === undefined ? '' : String(a.year),
    category: a.category,
    technique: a.technique ?? '',
    material: a.material ?? '',
    w: str(a.dimensionsCm.w),
    h: str(a.dimensionsCm.h),
    d: str(a.dimensionsCm.d),
    weightKg: str(a.weightKg),
    edition: a.edition ?? '',
    description: a.description ?? '',
    basis: a.basis,
    status: a.status,
    location: a.location,
    reservationUntil: a.reservation?.until ?? '',
    reservationNote: a.reservation?.note ?? '',
    salePrice: str(a.salePrice),
    currency: a.currency,
    purchasePrice: str(prices?.purchasePrice),
    minPrice: str(prices?.minPrice),
  };
}

/** „1 234,50” → 1234.5; zwraca NaN, gdy to nie liczba. Puste pole → undefined. */
export function parseNumber(text: string): number | undefined {
  const cleaned = text.replace(/[\s ]/g, '').replace(',', '.');
  if (cleaned === '') return undefined;
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
}

export function validate(v: FormValues, photoCount: number): FormErrors {
  const errors: FormErrors = {};
  const currentYear = new Date().getFullYear();

  if (!v.title.trim()) errors.title = 'Wpisz tytuł dzieła.';
  if (!v.artist.trim()) errors.artist = 'Wpisz imię i nazwisko artysty.';

  const year = parseNumber(v.year);
  if (year !== undefined && (!Number.isInteger(year) || year < 1000 || year > currentYear + 1)) {
    errors.year = `Podaj rok między 1000 a ${currentYear + 1}.`;
  }

  for (const key of ['w', 'h'] as const) {
    const n = parseNumber(v[key]);
    const name = key === 'w' ? 'szerokość' : 'wysokość';
    if (n === undefined) errors[key] = `Podaj ${name} w cm.`;
    else if (Number.isNaN(n) || n <= 0) errors[key] = 'Wpisz liczbę większą od zera.';
  }
  const d = parseNumber(v.d);
  if (d !== undefined && (Number.isNaN(d) || d <= 0)) errors.d = 'Wpisz liczbę większą od zera.';
  const weight = parseNumber(v.weightKg);
  if (weight !== undefined && (Number.isNaN(weight) || weight <= 0)) {
    errors.weightKg = 'Wpisz liczbę większą od zera.';
  }

  const price = parseNumber(v.salePrice);
  if (price === undefined) errors.salePrice = 'Podaj cenę sprzedaży.';
  else if (Number.isNaN(price) || price < 0) errors.salePrice = 'Wpisz poprawną kwotę, np. 1500 lub 1500,50.';

  for (const key of ['purchasePrice', 'minPrice'] as const) {
    const n = parseNumber(v[key]);
    if (n !== undefined && (Number.isNaN(n) || n < 0)) errors[key] = 'Wpisz poprawną kwotę.';
  }

  if (v.status === 'zarezerwowane') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.reservationUntil)) {
      errors.reservationUntil = 'Rezerwacja wymaga daty, do kiedy obowiązuje.';
    }
  }

  if (photoCount < 1) errors.photos = 'Dodaj co najmniej jedno zdjęcie.';
  else if (photoCount > MAX_PHOTOS) errors.photos = `Maksymalnie ${MAX_PHOTOS} zdjęć.`;

  return errors;
}

const opt = (s: string) => (s.trim() === '' ? undefined : s.trim());

/** Zakłada, że `validate` nie zwróciło błędów. */
export function valuesToInput(v: FormValues): ArtworkInput {
  const year = parseNumber(v.year);
  const d = parseNumber(v.d);
  const weight = parseNumber(v.weightKg);
  const reserved = v.status === 'zarezerwowane';
  return {
    title: v.title.trim(),
    artist: v.artist.trim(),
    year,
    category: v.category,
    technique: opt(v.technique),
    material: opt(v.material),
    dimensionsCm: { w: parseNumber(v.w) as number, h: parseNumber(v.h) as number, d },
    weightKg: weight,
    edition: opt(v.edition),
    description: opt(v.description),
    basis: v.basis,
    status: v.status,
    location: v.location,
    reservation: reserved ? { until: v.reservationUntil, note: opt(v.reservationNote) } : undefined,
    salePrice: parseNumber(v.salePrice) as number,
    currency: v.currency,
  };
}

/** Ceny wewnętrzne z formularza (puste pole = brak ceny). */
export function valuesToPrices(v: FormValues): { purchasePrice?: number; minPrice?: number } {
  return { purchasePrice: parseNumber(v.purchasePrice), minPrice: parseNumber(v.minPrice) };
}

/** Wymagane pola, których jeszcze brakuje — do podpisu „Brakuje: …” przy przycisku zapisu. */
export function missingFields(errors: FormErrors): string[] {
  const out: string[] = [];
  if (errors.photos) out.push('zdjęcie');
  if (errors.title) out.push('tytuł');
  if (errors.artist) out.push('artysta');
  if (errors.w || errors.h) out.push('wymiary');
  if (errors.salePrice) out.push('cena');
  if (errors.reservationUntil) out.push('data rezerwacji');
  return out;
}
