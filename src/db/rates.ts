import { db as defaultDb, type KatalogDB } from './db';
import { fetchEurRate, RateError, type EurRate } from '../lib/nbp';

export interface StoredRate extends EurRate {
  /** Kiedy ostatnio udało się pobrać kurs (ISO). */
  fetchedAt: string;
  /** Kurs wpisany ręcznie — automatyczne pobieranie go nie nadpisuje. */
  manual?: boolean;
}

export const RATE_KEY = 'rate.eur';
/** Nie odpytujemy NBP częściej niż co tyle (kurs zmienia się raz na dobę roboczą). */
export const REFRESH_AFTER_MS = 6 * 60 * 60_000;
/** Po tylu godzinach bez udanego pobrania kurs oznaczamy datą. */
export const STALE_AFTER_MS = 36 * 60 * 60_000;

export async function getStoredRate(database: KatalogDB = defaultDb): Promise<StoredRate | undefined> {
  return (await database.meta.get(RATE_KEY))?.value as StoredRate | undefined;
}

export function isStale(rate: StoredRate, now = Date.now()): boolean {
  return !rate.manual && now - Date.parse(rate.fetchedAt) > STALE_AFTER_MS;
}

/**
 * Odświeża kurs z NBP i zapisuje go w Dexie. Bez `force` robi to tylko, gdy ostatnie pobranie jest stare
 * i kurs nie jest ręczny. Przy błędzie zostaje ostatni znany kurs (offline działa jak zwykle).
 * Zwraca aktualnie obowiązujący kurs.
 */
export async function refreshEurRate(
  options: { force?: boolean; fetchImpl?: typeof fetch; database?: KatalogDB; now?: number } = {},
): Promise<StoredRate | undefined> {
  const database = options.database ?? defaultDb;
  const now = options.now ?? Date.now();
  const current = await getStoredRate(database);
  if (!options.force) {
    if (current?.manual) return current;
    if (current && now - Date.parse(current.fetchedAt) < REFRESH_AFTER_MS) return current;
  }
  try {
    const fresh = await fetchEurRate(options.fetchImpl);
    const stored: StoredRate = { ...fresh, fetchedAt: new Date(now).toISOString() };
    await database.meta.put({ key: RATE_KEY, value: stored });
    return stored;
  } catch (e) {
    if (options.force) throw e; // ręczne odświeżenie pokazuje błąd; automatyczne cicho zostaje przy starym kursie
    return current;
  }
}

/** Ręcznie wpisany kurs (gdy NBP jest niedostępny). */
export async function setManualRate(rate: number, database: KatalogDB = defaultDb, now = Date.now()): Promise<void> {
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) throw new RateError('Podaj kurs, np. 4,27.');
  const d = new Date(now);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const stored: StoredRate = { rate, date, fetchedAt: d.toISOString(), manual: true };
  await database.meta.put({ key: RATE_KEY, value: stored });
}

/** Wraca do automatycznego kursu NBP. */
export async function clearManualRate(database: KatalogDB = defaultDb): Promise<void> {
  const current = await getStoredRate(database);
  if (current?.manual) await database.meta.delete(RATE_KEY);
}
