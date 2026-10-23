import { emptyForm, parseNumber, validate, valuesToInput, type FormValues } from './formValues';

const valid = (): FormValues => ({
  ...emptyForm(),
  title: 'Zima',
  artist: 'Jan Kowalski',
  w: '60',
  h: '80,5',
  salePrice: '1 500,50',
});

describe('parseNumber', () => {
  it('rozumie przecinek i spacje', () => {
    expect(parseNumber('1 234,50')).toBe(1234.5);
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber('abc')).toBeNaN();
  });
});

describe('validate', () => {
  it('przepuszcza poprawne dane', () => {
    expect(validate(valid(), 1)).toEqual({});
  });

  it('wymaga tytułu, artysty, wymiarów, ceny i zdjęcia', () => {
    const errors = validate(emptyForm(), 0);
    expect(Object.keys(errors).sort()).toEqual(['artist', 'h', 'photos', 'salePrice', 'title', 'w']);
    expect(errors.title).toBe('Wpisz tytuł dzieła.');
  });

  it('wymaga daty przy rezerwacji', () => {
    const v = { ...valid(), status: 'zarezerwowane' as const };
    expect(validate(v, 1).reservationUntil).toMatch(/daty/);
    expect(validate({ ...v, reservationUntil: '2026-11-30' }, 1)).toEqual({});
  });

  it('pilnuje limitu 5 zdjęć', () => {
    expect(validate(valid(), 6).photos).toMatch(/Maksymalnie 5/);
  });

  it('odrzuca ujemną cenę i zerowy wymiar', () => {
    const errors = validate({ ...valid(), salePrice: '-5', w: '0' }, 1);
    expect(errors.salePrice).toBeDefined();
    expect(errors.w).toBeDefined();
  });
});

describe('valuesToInput', () => {
  it('zamienia tekst na liczby i czyści rezerwację poza statusem „zarezerwowane”', () => {
    const input = valuesToInput({ ...valid(), reservationUntil: '2026-11-30', year: '2020' });
    expect(input.dimensionsCm).toEqual({ w: 60, h: 80.5, d: undefined });
    expect(input.salePrice).toBe(1500.5);
    expect(input.year).toBe(2020);
    expect(input.reservation).toBeUndefined();
  });
});
