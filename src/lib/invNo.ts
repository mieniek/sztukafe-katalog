// Bez znaków łatwych do pomylenia (0/O, 1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Tymczasowy numer nadawany lokalnie: SZK-2026-TA7K2. Numer finalny nada synchronizacja (faza 3). */
export function provisionalInvNo(year = new Date().getFullYear()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const suffix = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `SZK-${year}-T${suffix}`;
}
