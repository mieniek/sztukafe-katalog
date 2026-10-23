import type { Artwork } from '../../db/types';
import { DEFAULT_FILTERS, filterAndSort, normalizeText } from './listFilters';

function art(over: Partial<Artwork>): Artwork {
  return {
    id: 'x',
    invNo: 'SZK-2026-0001',
    invNoProvisional: false,
    title: 'Bez tytułu',
    artist: 'Anna Nowak',
    category: 'malarstwo',
    dimensionsCm: { w: 10, h: 10 },
    basis: 'wlasnosc',
    status: 'dostepne',
    location: 'magazyn',
    salePrice: 1000,
    currency: 'PLN',
    photoIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'a',
    updatedBy: 'a',
    ...over,
  };
}

const set = [
  art({ id: '1', title: 'Żółw', artist: 'Łukasz Zając', salePrice: 500, createdAt: '2026-01-01T00:00:00.000Z' }),
  art({ id: '2', title: 'Morze', status: 'sprzedane', salePrice: 3000, createdAt: '2026-02-01T00:00:00.000Z' }),
  art({ id: '3', title: 'Las', salePrice: 1500, createdAt: '2026-03-01T00:00:00.000Z', deleted: true }),
];

const ids = (list: Artwork[]) => list.map((a) => a.id);

describe('filterAndSort', () => {
  it('pomija usunięte i sortuje od najnowszych', () => {
    expect(ids(filterAndSort(set, DEFAULT_FILTERS))).toEqual(['2', '1']);
  });

  it('szuka bez względu na polskie znaki i wielkość liter', () => {
    expect(normalizeText('Żółw')).toBe('zolw');
    expect(ids(filterAndSort(set, { ...DEFAULT_FILTERS, query: 'zolw' }))).toEqual(['1']);
    expect(ids(filterAndSort(set, { ...DEFAULT_FILTERS, query: 'LUKASZ' }))).toEqual(['1']);
  });

  it('filtruje po statusie i cenie', () => {
    expect(ids(filterAndSort(set, { ...DEFAULT_FILTERS, status: 'sprzedane' }))).toEqual(['2']);
    expect(ids(filterAndSort(set, { ...DEFAULT_FILTERS, priceFrom: '1000', priceTo: '5000' }))).toEqual(['2']);
  });

  it('sortuje po cenie', () => {
    expect(ids(filterAndSort(set, { ...DEFAULT_FILTERS, sort: 'price_asc' }))).toEqual(['1', '2']);
  });

  it('filtruje i sortuje po cenie w złotych, przeliczając EUR po kursie', () => {
    const mixed = [
      art({ id: 'a', salePrice: 3000, currency: 'PLN', createdAt: '2026-01-01T00:00:00.000Z' }),
      art({ id: 'b', salePrice: 1000, currency: 'EUR', createdAt: '2026-01-02T00:00:00.000Z' }), // 4270 zł
      art({ id: 'c', salePrice: 500, currency: 'EUR', createdAt: '2026-01-03T00:00:00.000Z' }), // 2135 zł
    ];
    const f = { ...DEFAULT_FILTERS, sort: 'price_desc' as const };
    expect(ids(filterAndSort(mixed, f, 4.27))).toEqual(['b', 'a', 'c']);
    expect(ids(filterAndSort(mixed, { ...f, priceFrom: '2500', priceTo: '4000' }, 4.27))).toEqual(['a']);
    // bez kursu porównujemy kwoty w walucie dzieła
    expect(ids(filterAndSort(mixed, f))).toEqual(['a', 'b', 'c']);
  });
});
