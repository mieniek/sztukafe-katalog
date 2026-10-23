export const NBP_EUR_URL = 'https://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json';

export interface EurRate {
  /** Ile złotych kosztuje 1 EUR (kurs średni NBP, tabela A). */
  rate: number;
  /** Data obowiązywania kursu, RRRR-MM-DD. */
  date: string;
}

/** Błąd z komunikatem, który można pokazać użytkownikowi. */
export class RateError extends Error {}

/** Pobiera aktualny kurs EUR z NBP. `fetchImpl` do podmiany w testach. */
export async function fetchEurRate(fetchImpl: typeof fetch = fetch): Promise<EurRate> {
  let res: Response;
  try {
    res = await fetchImpl(NBP_EUR_URL);
  } catch {
    throw new RateError('Nie udało się pobrać kursu z NBP (brak internetu albo połączenie zablokowane).');
  }
  if (!res.ok) throw new RateError(`NBP odpowiedział błędem (${res.status}).`);
  try {
    const body = (await res.json()) as { rates?: { mid?: number; effectiveDate?: string }[] };
    const item = body.rates?.[0];
    if (typeof item?.mid === 'number' && item.mid > 0 && item.effectiveDate) {
      return { rate: item.mid, date: item.effectiveDate };
    }
  } catch {
    // niżej zgłaszamy ten sam komunikat
  }
  throw new RateError('NBP zwrócił nieoczekiwane dane. Spróbuj później albo wpisz kurs ręcznie.');
}

/** Kwota w złotych; PLN zostaje bez zmian, EUR wymaga kursu (bez niego zwraca undefined). */
export function toPln(amount: number, currency: 'PLN' | 'EUR', eurRate?: number): number | undefined {
  if (currency === 'PLN') return amount;
  return eurRate ? amount * eurRate : undefined;
}

/** 4,3685 → „4,3685”, 4,27 → „4,27” (do 4 miejsc, bez zbędnych zer). */
export function formatRate(rate: number): string {
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(rate);
}
