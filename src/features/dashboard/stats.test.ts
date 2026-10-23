import type { Artwork } from '../../db/types';
import { collectionValue, expiringReservations, soldInYear } from './stats';

const base: Artwork = {
  id: 'x',
  invNo: 'SZK-2026-0001',
  invNoProvisional: false,
  title: 'T',
  artist: 'A',
  category: 'malarstwo',
  dimensionsCm: { w: 1, h: 1 },
  basis: 'wlasnosc',
  status: 'dostepne',
  location: 'magazyn',
  salePrice: 1000,
  currency: 'PLN',
  photoIds: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  createdBy: 'a',
  updatedBy: 'a',
};
const art = (over: Partial<Artwork>): Artwork => ({ ...base, ...over });

describe('collectionValue', () => {
  const set = [
    art({ id: '1', salePrice: 1000 }),
    art({ id: '2', salePrice: 500, status: 'zarezerwowane' }),
    art({ id: '3', salePrice: 9999, status: 'sprzedane' }),
    art({ id: '4', salePrice: 9999, deleted: true }),
    art({ id: '5', salePrice: 100, currency: 'EUR' }),
  ];

  it('pomija sprzedane i usunięte, a EUR bez kursu liczy osobno', () => {
    expect(collectionValue(set)).toEqual({ totalPln: 1500, skippedEur: 1 });
  });

  it('przelicza EUR po kursie NBP', () => {
    expect(collectionValue(set, 4.27)).toEqual({ totalPln: 1500 + 427, skippedEur: 0 });
  });
});

describe('soldInYear', () => {
  it('liczy sprzedane w danym roku i podaje datę ostatniej', () => {
    const set = [
      art({ id: '1', status: 'sprzedane', soldAt: '2026-03-01T10:00:00Z' }),
      art({ id: '2', status: 'sprzedane', soldAt: '2026-05-10T10:00:00Z' }),
      art({ id: '3', status: 'sprzedane', soldAt: '2025-12-31T10:00:00Z' }),
      art({ id: '4', status: 'dostepne' }),
    ];
    expect(soldInYear(set, 2026)).toEqual({ count: 2, lastDate: '2026-05-10T10:00:00Z' });
  });
});

describe('expiringReservations', () => {
  it('wybiera rezerwacje wygasające w ciągu 7 dni, od najbliższej', () => {
    const r = (id: string, until: string) => art({ id, status: 'zarezerwowane', reservation: { until } });
    const list = expiringReservations([r('a', '2026-10-29'), r('b', '2026-10-30'), r('c', '2026-10-23')], '2026-10-22');
    expect(list.map((x) => x.id)).toEqual(['c', 'a']);
  });
});

describe('wartość zbioru — ręczne przeliczenie na danych testowych', () => {
  it('zgadza się z sumą policzoną ręcznie', () => {
    // 3 dzieła w PLN: 1 200 + 2 500,50 + 800 = 4 500,50
    // 2 dzieła w EUR: 1 000 + 250 = 1 250 € × 4,3685 = 5 460,625
    // sprzedane (5 000 zł) i usunięte (9 999 zł) nie wchodzą do sumy
    const set = [
      art({ id: '1', salePrice: 1200 }),
      art({ id: '2', salePrice: 2500.5, status: 'w_magazynie' }),
      art({ id: '3', salePrice: 800, status: 'zarezerwowane' }),
      art({ id: '4', salePrice: 1000, currency: 'EUR' }),
      art({ id: '5', salePrice: 250, currency: 'EUR' }),
      art({ id: '6', salePrice: 5000, status: 'sprzedane' }),
      art({ id: '7', salePrice: 9999, deleted: true }),
    ];
    const { totalPln, skippedEur } = collectionValue(set, 4.3685);
    expect(totalPln).toBeCloseTo(4500.5 + 5460.625, 6);
    expect(skippedEur).toBe(0);
  });
});
