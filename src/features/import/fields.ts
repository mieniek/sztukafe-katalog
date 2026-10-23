import { norm } from './normalize';

export type FieldKey =
  | 'title'
  | 'artist'
  | 'year'
  | 'category'
  | 'technique'
  | 'material'
  | 'dimensions'
  | 'width'
  | 'height'
  | 'depth'
  | 'weightKg'
  | 'edition'
  | 'description'
  | 'basis'
  | 'status'
  | 'location'
  | 'reservationUntil'
  | 'salePrice'
  | 'currency'
  | 'purchasePrice'
  | 'minPrice'
  | 'oldInvNo';

export interface FieldDef {
  key: FieldKey;
  label: string;
  /** Pole wymagane w katalogu (wymiary: wystarczy jedna kolumna „Wymiary” albo szerokość + wysokość). */
  required?: boolean;
  hint?: string;
  /** Nagłówki rozpoznawane automatycznie (po normalizacji: małe litery, bez polskich znaków). */
  synonyms: string[];
}

/**
 * Kolejność ma znaczenie przy automatycznym dopasowaniu: pola bardziej szczegółowe
 * (np. „cena zakupu”) są dopasowywane przed ogólnymi („cena”).
 */
export const FIELDS: FieldDef[] = [
  { key: 'purchasePrice', label: 'Cena zakupu', synonyms: ['cena zakupu', 'zakup', 'cena nabycia', 'koszt', 'purchase price', 'cost'] },
  { key: 'minPrice', label: 'Cena minimalna', synonyms: ['cena minimalna', 'cena min', 'minimalna', 'cena dolna', 'min price', 'floor price'] },
  { key: 'salePrice', label: 'Cena sprzedaży', required: true, synonyms: ['cena sprzedazy', 'cena', 'cena brutto', 'cena katalogowa', 'wartosc', 'price', 'sale price'] },
  { key: 'currency', label: 'Waluta', synonyms: ['waluta', 'currency', 'cur'] },
  { key: 'title', label: 'Tytuł', required: true, synonyms: ['tytul', 'nazwa', 'nazwa dziela', 'tytul dziela', 'dzielo', 'title', 'name'] },
  { key: 'artist', label: 'Artysta', required: true, synonyms: ['artysta', 'autor', 'tworca', 'artystka', 'imie i nazwisko', 'artist', 'author'] },
  { key: 'year', label: 'Rok', synonyms: ['rok', 'rok powstania', 'data powstania', 'data', 'year', 'datowanie'] },
  { key: 'category', label: 'Kategoria', synonyms: ['kategoria', 'rodzaj', 'typ', 'dziedzina', 'category', 'type'] },
  { key: 'technique', label: 'Technika', synonyms: ['technika', 'technique', 'medium'] },
  { key: 'material', label: 'Materiał / podłoże', synonyms: ['material', 'podloze', 'material podloze', 'tworzywo', 'support'] },
  { key: 'width', label: 'Szerokość (cm)', synonyms: ['szerokosc', 'szer', 'width', 'szerokosc cm', 'szer cm'] },
  { key: 'height', label: 'Wysokość (cm)', synonyms: ['wysokosc', 'wys', 'height', 'wysokosc cm', 'wys cm'] },
  { key: 'depth', label: 'Głębokość (cm)', synonyms: ['glebokosc', 'gleb', 'depth', 'glebokosc cm', 'gleb cm'] },
  { key: 'dimensions', label: 'Wymiary (w jednej kolumnie)', required: true, hint: 'np. 60 × 80 cm', synonyms: ['wymiary', 'wymiar', 'rozmiar', 'rozmiary', 'dimensions', 'size'] },
  { key: 'weightKg', label: 'Waga (kg)', synonyms: ['waga', 'waga kg', 'masa', 'weight'] },
  { key: 'edition', label: 'Edycja', synonyms: ['edycja', 'naklad', 'edition'] },
  { key: 'description', label: 'Opis', synonyms: ['opis', 'uwagi', 'komentarz', 'notatki', 'description', 'notes'] },
  { key: 'basis', label: 'Podstawa (własność / komis)', synonyms: ['podstawa', 'wlasnosc', 'komis', 'forma', 'basis'] },
  { key: 'status', label: 'Status', synonyms: ['status', 'dostepnosc', 'availability'] },
  { key: 'location', label: 'Lokalizacja', synonyms: ['lokalizacja', 'miejsce', 'miejsce przechowywania', 'gdzie', 'location'] },
  { key: 'reservationUntil', label: 'Rezerwacja do', synonyms: ['rezerwacja do', 'zarezerwowane do', 'termin rezerwacji', 'reserved until'] },
  { key: 'oldInvNo', label: 'Numer z poprzedniego programu', hint: 'trafi do opisu', synonyms: ['nr inw', 'numer inwentarzowy', 'nr inwentarzowy', 'sygnatura', 'id', 'lp', 'numer', 'inventory number', 'inv no'] },
];

export type Mapping = Partial<Record<FieldKey, number>>;

/** Dopasowuje kolumny pliku do pól katalogu po nazwach nagłówków (dokładnie, potem częściowo). */
export function autoMap(headers: string[]): Mapping {
  const normalized = headers.map(norm);
  const mapping: Mapping = {};
  const used = new Set<number>();

  const syn = (f: FieldDef) => f.synonyms.map(norm);

  // 1. dopasowanie dokładne
  for (const f of FIELDS) {
    const i = normalized.findIndex((h, idx) => !used.has(idx) && h !== '' && syn(f).includes(h));
    if (i >= 0) {
      mapping[f.key] = i;
      used.add(i);
    }
  }
  // 2. dopasowanie częściowe: nagłówek zawiera synonim jako całe słowa („Cena sprzedaży (PLN)”)
  for (const f of FIELDS) {
    if (mapping[f.key] !== undefined) continue;
    const i = normalized.findIndex(
      (h, idx) => !used.has(idx) && syn(f).some((s) => s.length >= 3 && new RegExp(`(^| )${s}( |$)`).test(h)),
    );
    if (i >= 0) {
      mapping[f.key] = i;
      used.add(i);
    }
  }
  return mapping;
}
