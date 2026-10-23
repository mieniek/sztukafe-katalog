import Papa from 'papaparse';

export interface Table {
  /** Nagłówki (pierwszy niepusty wiersz pliku). */
  headers: string[];
  /** Wiersze danych jako tekst; `line` to numer wiersza w pliku (do raportu błędów). */
  rows: { line: number; cells: string[] }[];
}

/** Błąd z komunikatem do pokazania użytkownikowi. */
export class ImportFileError extends Error {}

/** UTF-8 (z BOM lub bez), a gdy bajty nie są poprawnym UTF-8 — Windows-1250 (typowy eksport z polskiego Excela). */
export function decodeText(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(view).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1250').decode(view);
  }
}

function cellToText(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) {
    return `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, '0')}-${String(cell.getDate()).padStart(2, '0')}`;
  }
  return String(cell).trim();
}

/** Zamienia tablicę wierszy na tabelę: pierwszy niepusty wiersz = nagłówki, puste wiersze pomijane. */
export function toTable(grid: unknown[][]): Table {
  const texts = grid.map((r) => r.map(cellToText));
  const first = texts.findIndex((r) => r.some((c) => c !== ''));
  if (first < 0) throw new ImportFileError('Plik jest pusty.');
  const headers = texts[first].map((h, i) => h || `Kolumna ${i + 1}`);
  const rows = texts
    .slice(first + 1)
    .map((cells, i) => ({ line: first + i + 2, cells }))
    .filter((r) => r.cells.some((c) => c !== ''));
  if (rows.length === 0) throw new ImportFileError('W pliku są tylko nagłówki — nie ma dzieł do zaimportowania.');
  return { headers, rows };
}

/** CSV: separator (przecinek, średnik, tabulator, kreska pionowa) wykrywany automatycznie. */
export function parseCsv(text: string): Table {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy', delimitersToGuess: [';', ',', '\t', '|'] });
  if (result.data.length === 0) throw new ImportFileError('Plik jest pusty.');
  return toTable(result.data);
}

/** Wczytuje plik CSV / TXT / XLSX wybrany przez użytkownika. */
export async function readTable(file: File): Promise<Table> {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.xlsx')) {
      // Ładowane dopiero przy imporcie XLSX (osobny fragment kodu).
      const { default: readXlsx } = await import('read-excel-file/browser');
      const sheets = await readXlsx(file);
      const first = sheets.find((s: { data: unknown[][] }) => s.data.length > 0);
      if (!first) throw new ImportFileError('Arkusz jest pusty.');
      return toTable(first.data as unknown[][]);
    }
    if (name.endsWith('.xls')) {
      throw new ImportFileError('Stary format .xls nie jest obsługiwany. W Excelu wybierz „Zapisz jako” → .xlsx albo CSV.');
    }
    return parseCsv(decodeText(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof ImportFileError) throw e;
    throw new ImportFileError('Nie udało się odczytać pliku. Zapisz go jako CSV (UTF-8) albo XLSX i spróbuj ponownie.');
  }
}
