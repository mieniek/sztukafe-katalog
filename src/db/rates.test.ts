import { db } from './db';
import { clearManualRate, getStoredRate, isStale, refreshEurRate, setManualRate } from './rates';
import { fetchEurRate, formatRate, toPln } from '../lib/nbp';

const nbpResponse = (mid: number, effectiveDate = '2026-10-21') =>
  new Response(JSON.stringify({ table: 'A', code: 'EUR', rates: [{ no: '1', effectiveDate, mid }] }), { status: 200 });

const fetchOk = (mid: number, date?: string) => vi.fn(async () => nbpResponse(mid, date)) as unknown as typeof fetch;
const fetchFail = vi.fn(async () => {
  throw new TypeError('Failed to fetch');
}) as unknown as typeof fetch;

const NOW = Date.UTC(2026, 9, 22, 8, 0);

beforeEach(async () => {
  await db.meta.clear();
});

describe('fetchEurRate', () => {
  it('czyta kurs i datę z odpowiedzi NBP', async () => {
    expect(await fetchEurRate(fetchOk(4.27, '2026-10-21'))).toEqual({ rate: 4.27, date: '2026-10-21' });
  });

  it('zgłasza czytelny błąd przy braku sieci, błędzie serwera i dziwnych danych', async () => {
    await expect(fetchEurRate(fetchFail)).rejects.toThrow(/brak internetu/);
    const server = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    await expect(fetchEurRate(server)).rejects.toThrow(/500/);
    const junk = vi.fn(async () => new Response('{"rates":[]}')) as unknown as typeof fetch;
    await expect(fetchEurRate(junk)).rejects.toThrow(/nieoczekiwane/);
  });
});

describe('refreshEurRate', () => {
  it('zapisuje pobrany kurs w Dexie z datą pobrania', async () => {
    const r = await refreshEurRate({ fetchImpl: fetchOk(4.27), now: NOW });
    expect(r).toMatchObject({ rate: 4.27, date: '2026-10-21' });
    expect((await getStoredRate())?.fetchedAt).toBe(new Date(NOW).toISOString());
  });

  it('nie odpytuje NBP częściej niż co 6 godzin', async () => {
    await refreshEurRate({ fetchImpl: fetchOk(4.27), now: NOW });
    const again = fetchOk(4.4);
    const r = await refreshEurRate({ fetchImpl: again, now: NOW + 60 * 60_000 });
    expect(again).not.toHaveBeenCalled();
    expect(r?.rate).toBe(4.27);

    await refreshEurRate({ fetchImpl: again, now: NOW + 7 * 60 * 60_000 });
    expect(again).toHaveBeenCalledTimes(1);
    expect((await getStoredRate())?.rate).toBe(4.4);
  });

  it('offline zostaje przy ostatnim znanym kursie i oznacza go jako przestarzały po 36 h', async () => {
    await refreshEurRate({ fetchImpl: fetchOk(4.27), now: NOW });
    const later = NOW + 48 * 60 * 60_000;
    const r = await refreshEurRate({ fetchImpl: fetchFail, now: later });
    expect(r?.rate).toBe(4.27);
    expect(isStale(r!, later)).toBe(true);
    expect(isStale(r!, NOW + 60_000)).toBe(false);
  });

  it('ręczne odświeżenie pokazuje błąd, a stary kurs zostaje', async () => {
    await refreshEurRate({ fetchImpl: fetchOk(4.27), now: NOW });
    await expect(refreshEurRate({ force: true, fetchImpl: fetchFail, now: NOW })).rejects.toThrow();
    expect((await getStoredRate())?.rate).toBe(4.27);
  });

  it('kurs wpisany ręcznie nie jest nadpisywany automatycznie, dopóki go nie wyczyścimy', async () => {
    await setManualRate(4.5, db, NOW);
    const fetcher = fetchOk(4.27);
    const r = await refreshEurRate({ fetchImpl: fetcher, now: NOW + 100 * 60 * 60_000 });
    expect(fetcher).not.toHaveBeenCalled();
    expect(r).toMatchObject({ rate: 4.5, manual: true });
    expect(isStale(r!, NOW + 100 * 60 * 60_000)).toBe(false);

    await clearManualRate();
    const after = await refreshEurRate({ fetchImpl: fetcher, now: NOW });
    expect(after).toMatchObject({ rate: 4.27 });
    expect(after?.manual).toBeUndefined();
  });

  it('odrzuca niepoprawny kurs ręczny', async () => {
    await expect(setManualRate(0)).rejects.toThrow();
    await expect(setManualRate(Number.NaN)).rejects.toThrow();
    await expect(setManualRate(1000)).rejects.toThrow();
  });
});

describe('toPln / formatRate', () => {
  it('przelicza EUR i zostawia PLN', () => {
    expect(toPln(1000, 'PLN', 4.27)).toBe(1000);
    expect(toPln(1000, 'EUR', 4.27)).toBeCloseTo(4270);
    expect(toPln(1000, 'EUR')).toBeUndefined();
  });

  it('formatuje kurs po polsku', () => {
    expect(formatRate(4.3685)).toBe('4,3685');
    expect(formatRate(4.27)).toBe('4,27');
    expect(formatRate(4)).toBe('4,00');
  });
});
