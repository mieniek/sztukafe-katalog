import type { Basis, Category, Currency, Location, Status } from '../../db/types';

/** Małe litery, bez polskich znaków i znaków specjalnych — do porównywania nagłówków i wartości. */
export function norm(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9€]+/g, ' ')
    .trim();
}

export interface Amount {
  value?: number;
  currency?: Currency;
}

/**
 * Kwota z tekstu: „12 500,50 zł”, „€1 200”, „1.200,50”, „1,200.50”, „2500”.
 * Zwraca też walutę, jeśli była zapisana w komórce.
 */
export function parseAmount(raw: unknown): Amount {
  if (typeof raw === 'number') return Number.isFinite(raw) ? { value: raw } : {};
  const text = String(raw ?? '').trim();
  if (!text) return {};
  const currency: Currency | undefined = /€|eur/i.test(text) ? 'EUR' : /zł|zl|pln/i.test(text) ? 'PLN' : undefined;
  let s = text.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return { currency };
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // oba znaki: ten, który jest dalej, to separator dziesiętny
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? /\./g : /,/g;
    s = s.replace(thousands, '').replace(decimal, '.');
  } else if (lastComma >= 0) {
    s = s.replace(/,(?=.*,)/g, '').replace(',', '.'); // po polsku przecinek to separator dziesiętny
  } else if (lastDot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // 1.200 / 12.500.000 to tysiące
  }
  const value = Number(s);
  return Number.isFinite(value) ? { value, currency } : { currency };
}

export function parseYear(raw: unknown): number | undefined {
  const m = /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(String(raw ?? ''));
  return m ? Number(m[1]) : undefined;
}

export interface Dimensions {
  a: number;
  b: number;
  c?: number;
}

/** „60 x 80”, „60×80×5 cm”, „60 cm x 80 cm”, „600 x 800 mm”, „60/80”. Zwraca liczby w kolejności z komórki. */
export function parseDimensions(raw: unknown): Dimensions | undefined {
  const text = String(raw ?? '').toLowerCase();
  const mm = /\bmm\b/.test(text);
  const numbers = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.')) / (mm ? 10 : 1));
  if (numbers.length < 2 || numbers.some((n) => !(n > 0))) return undefined;
  return { a: numbers[0], b: numbers[1], c: numbers[2] };
}

const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

export function parseCategory(raw: unknown): Category | undefined {
  const t = norm(raw);
  if (!t) return undefined;
  if (has(t, 'malar', 'obraz', 'olej', 'akryl', 'akwarel', 'pastel', 'painting')) return 'malarstwo';
  if (has(t, 'rysun', 'drawing', 'szkic')) return 'rysunek';
  if (has(t, 'grafi', 'litograf', 'drzeworyt', 'akwaforta', 'sitodruk', 'linoryt', 'print')) return 'grafika';
  if (has(t, 'fotograf', 'zdjec', 'photo')) return 'fotografia';
  if (has(t, 'rzezb', 'sculpt', 'obiekt')) return 'rzezba';
  if (has(t, 'ceramik', 'porcelan', 'ceramic')) return 'ceramika';
  if (has(t, 'szklo', 'witraz', 'glass')) return 'szklo';
  if (has(t, 'bizuter', 'rzemiosl', 'jewel', 'craft', 'tekstyl', 'tkanin')) return 'bizuteria_rzemioslo';
  return undefined;
}

export function parseStatus(raw: unknown): Status | undefined {
  const t = norm(raw);
  if (!t) return undefined;
  if (has(t, 'sprzedan', 'sold')) return 'sprzedane';
  if (has(t, 'rezerw', 'reserved')) return 'zarezerwowane';
  if (has(t, 'magazyn', 'storage')) return 'w_magazynie';
  if (has(t, 'dostep', 'sprzedaz', 'available', 'wystaw')) return 'dostepne';
  return undefined;
}

export function parseLocation(raw: unknown): Location | undefined {
  const t = norm(raw);
  if (!t) return undefined;
  if (has(t, 'magazyn', 'storage')) return 'magazyn';
  if (has(t, 'sala', 'galeri', 'wystaw', 'ekspozycj', 'gallery')) return 'sala_wystawowa';
  return undefined;
}

export function parseBasis(raw: unknown): Basis | undefined {
  const t = norm(raw);
  if (!t) return undefined;
  if (has(t, 'komis', 'consign')) return 'komis';
  if (has(t, 'wlasn', 'own', 'galeri')) return 'wlasnosc';
  return undefined;
}

/** „22.10.2026”, „2026-10-22”, „22/10/26” → „2026-10-22”; inaczej undefined. */
export function parseDate(raw: unknown): string | undefined {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`;
  }
  const text = String(raw ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(text))) {
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 100) y += 2000;
  } else return undefined;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
