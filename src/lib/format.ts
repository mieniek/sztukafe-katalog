import type { Artwork, Currency } from '../db/types';

/** 1 234 zł, 1 200 € — z groszami tylko gdy są (1 234,50 zł). Spacja niełamliwa, grupowanie także 4 cyfr. */
export function formatPrice(amount: number, currency: Currency): string {
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    useGrouping: 'always',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** 22.10.2026 — przyjmuje „RRRR-MM-DD” lub pełny znacznik ISO. */
export function formatDate(iso: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) return `${dateOnly[3]}.${dateOnly[2]}.${dateOnly[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

const numberPl = new Intl.NumberFormat('pl-PL', { useGrouping: 'always', maximumFractionDigits: 2 });

/** 60 × 80 cm  lub  60 × 80 × 5 cm */
export function formatDimensions(dim: Artwork['dimensionsCm']): string {
  const parts = [dim.w, dim.h, ...(dim.d ? [dim.d] : [])].map((n) => numberPl.format(n));
  return `${parts.join(' × ')} cm`;
}

export function formatNumber(n: number): string {
  return numberPl.format(n);
}

/** Dzisiejsza data jako „RRRR-MM-DD” w czasie lokalnym. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
