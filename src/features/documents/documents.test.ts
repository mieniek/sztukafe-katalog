import { db } from '../../db/db';
import { SHEET_CAPACITY, addLabel, clearLabels, getLabelQueue, removeLabel } from '../../db/labelQueue';
import { describeFilters, DEFAULT_FILTERS } from '../artworks/listFilters';
import { safeFileName, sharePdf } from './share';

describe('safeFileName', () => {
  it('usuwa polskie znaki i znaki specjalne z nazwy pliku', () => {
    expect(safeFileName('Karta-SZK-2026-0001-Zażółć gęślą jaźń')).toBe('Karta-SZK-2026-0001-Zazolc-gesla-jazn');
    expect(safeFileName('Łódź / "test"?')).toBe('Lodz-test');
    expect(safeFileName('???')).toBe('dokument');
  });
});

describe('kolejka etykiet', () => {
  beforeEach(async () => {
    await db.meta.clear();
  });

  it('dodaje, nie dubluje tej samej pracy i usuwa', async () => {
    expect(await addLabel({ artworkId: 'a', showPrice: true })).toBe(true);
    expect(await addLabel({ artworkId: 'a', showPrice: false })).toBe(true); // aktualizacja ustawienia ceny
    expect(await getLabelQueue()).toEqual([{ artworkId: 'a', showPrice: false }]);
    await removeLabel('a');
    expect(await getLabelQueue()).toEqual([]);
  });

  it('arkusz mieści 8 etykiet; dziewiąta jest odrzucona', async () => {
    for (let i = 0; i < SHEET_CAPACITY; i++) expect(await addLabel({ artworkId: String(i), showPrice: true })).toBe(true);
    expect(await addLabel({ artworkId: 'extra', showPrice: true })).toBe(false);
    expect(await getLabelQueue()).toHaveLength(8);
    await clearLabels();
    expect(await getLabelQueue()).toEqual([]);
  });
});

describe('describeFilters', () => {
  it('opisuje aktywne filtry katalogu', () => {
    expect(describeFilters(DEFAULT_FILTERS)).toBe('Wszystkie');
    expect(describeFilters({ ...DEFAULT_FILTERS, status: 'dostepne', query: 'kowalski', priceFrom: '1000' })).toBe(
      'Dostępne · szukaj: „kowalski” · cena 1000–∞ zł',
    );
  });
});

describe('sharePdf', () => {
  const bytes = new Uint8Array([37, 80, 68, 70]);

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  it('udostępnia plik PDF przez systemowe okno, gdy przeglądarka to umie', async () => {
    const share = vi.fn(async (_data: { files: File[] }) => {});
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    expect(await sharePdf(bytes, 'Karta-test.pdf', 'Karta')).toBe('shared');
    const arg = share.mock.calls[0][0];
    expect(arg.files[0].name).toBe('Karta-test.pdf');
    expect(arg.files[0].type).toBe('application/pdf');
  });

  it('anulowanie w oknie udostępniania nie jest błędem ani nie pobiera pliku', async () => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(async () => {
        throw new DOMException('anulowano', 'AbortError');
      }),
      configurable: true,
    });
    expect(await sharePdf(bytes, 'x.pdf', 'x')).toBe('cancelled');
  });

  it('bez obsługi udostępniania pobiera plik', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await sharePdf(bytes, 'Cennik-2026-10-22', 'Cennik')).toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(1);
  });
});
