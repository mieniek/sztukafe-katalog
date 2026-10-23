import { formatDate, formatDimensions, formatPrice } from './format';
import { provisionalInvNo } from './invNo';

// Intl używa twardych spacji — w porównaniu zamieniamy je na zwykłe.
const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('format', () => {
  it('formatuje cenę w złotych i euro', () => {
    expect(plain(formatPrice(1234.5, 'PLN'))).toBe('1 234,50 zł');
    expect(plain(formatPrice(1234.5, 'EUR'))).toBe('1 234,50 €');
    expect(plain(formatPrice(1234, 'PLN'))).toBe('1 234 zł');
    expect(plain(formatPrice(1200, 'EUR'))).toBe('1 200 €');
  });

  it('formatuje datę jako DD.MM.RRRR', () => {
    expect(formatDate('2026-10-22')).toBe('22.10.2026');
  });

  it('formatuje wymiary', () => {
    expect(formatDimensions({ w: 60, h: 80 })).toBe('60 × 80 cm');
    expect(formatDimensions({ w: 60, h: 80, d: 5 })).toBe('60 × 80 × 5 cm');
  });

  it('nadaje tymczasowy numer inwentarzowy', () => {
    expect(provisionalInvNo(2026)).toMatch(/^SZK-2026-T[A-Z2-9]{4}$/);
  });
});
