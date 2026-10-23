import type { Artwork } from '../../db/types';

const DAY_MS = 86_400_000;

export interface CollectionValue {
  /** Suma cen sprzedaży dzieł, które nie są sprzedane, w PLN. */
  totalPln: number;
  /** Ile dzieł w EUR pominięto, bo nie znamy kursu. */
  skippedEur: number;
}

/** Dzieła w EUR przeliczamy po kursie NBP (faza 5); bez kursu są pomijane i policzone osobno. */
export function collectionValue(artworks: Artwork[], eurRate?: number): CollectionValue {
  let totalPln = 0;
  let skippedEur = 0;
  for (const a of artworks) {
    if (a.deleted || a.status === 'sprzedane') continue;
    if (a.currency === 'PLN') totalPln += a.salePrice;
    else if (eurRate) totalPln += a.salePrice * eurRate;
    else skippedEur++;
  }
  return { totalPln, skippedEur };
}

export function soldInYear(artworks: Artwork[], year: number): { count: number; lastDate?: string } {
  let count = 0;
  let last: string | undefined;
  for (const a of artworks) {
    if (a.deleted || a.status !== 'sprzedane') continue;
    const when = a.soldAt ?? a.updatedAt;
    if (new Date(when).getFullYear() !== year) continue;
    count++;
    if (!last || when > last) last = when;
  }
  return { count, lastDate: last };
}

/** Rezerwacje kończące się w ciągu `days` dni (łącznie z dzisiejszą i już przeterminowanymi), najpierw najbliższe. */
export function expiringReservations(artworks: Artwork[], todayIso: string, days = 7): Artwork[] {
  const limit = new Date(Date.parse(todayIso) + days * DAY_MS).toISOString().slice(0, 10);
  return artworks
    .filter((a) => !a.deleted && a.status === 'zarezerwowane' && a.reservation?.until && a.reservation.until <= limit)
    .sort((a, b) => a.reservation!.until.localeCompare(b.reservation!.until));
}
