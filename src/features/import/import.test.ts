import { readFileSync } from 'node:fs';
import { db } from '../../db/db';
import { autoMap, FIELDS } from './fields';
import { importPlan } from './commit';
import { decodeText, parseCsv, toTable } from './readTable';
import { DEFAULT_OPTIONS, buildPlan, unmappedRequired } from './plan';
import {
  norm,
  parseAmount,
  parseCategory,
  parseDate,
  parseDimensions,
  parseStatus,
  parseYear,
} from './normalize';

const sample = () => parseCsv(decodeText(Uint8Array.from(readFileSync('src/features/import/fixtures/sample-pl.csv'))));

describe('normalizacja wartości', () => {
  it('rozumie różne zapisy kwot i walut', () => {
    expect(parseAmount('12 500,00 zł')).toEqual({ value: 12500, currency: 'PLN' });
    expect(parseAmount('€ 900')).toEqual({ value: 900, currency: 'EUR' });
    expect(parseAmount('1.200,50')).toEqual({ value: 1200.5 });
    expect(parseAmount('1,200.50')).toEqual({ value: 1200.5 });
    expect(parseAmount('12.000')).toEqual({ value: 12000 });
    expect(parseAmount('350,50')).toEqual({ value: 350.5 });
    expect(parseAmount(2500)).toEqual({ value: 2500 });
    expect(parseAmount('nieznana').value).toBeUndefined();
    expect(parseAmount('').value).toBeUndefined();
  });

  it('rozumie wymiary w różnych zapisach i w milimetrach', () => {
    expect(parseDimensions('60 x 80 cm')).toEqual({ a: 60, b: 80, c: undefined });
    expect(parseDimensions('42×59,4')).toEqual({ a: 42, b: 59.4, c: undefined });
    expect(parseDimensions('30 / 40 / 2 cm')).toEqual({ a: 30, b: 40, c: 2 });
    expect(parseDimensions('600 x 800 mm')).toEqual({ a: 60, b: 80, c: undefined });
    expect(parseDimensions('wymiary do uzupełnienia')).toBeUndefined();
    expect(parseDimensions('60')).toBeUndefined();
  });

  it('rozpoznaje rok, kategorię, status i datę', () => {
    expect(parseYear('ok. 1998')).toBe(1998);
    expect(parseYear('brak')).toBeUndefined();
    expect(parseCategory('Obraz olejny')).toBe('malarstwo');
    expect(parseCategory('Litografia')).toBe('grafika');
    expect(parseCategory('Biżuteria')).toBe('bizuteria_rzemioslo');
    expect(parseCategory('coś innego')).toBeUndefined();
    expect(parseStatus('Sprzedany')).toBe('sprzedane');
    expect(parseStatus('W magazynie')).toBe('w_magazynie');
    expect(parseStatus('zarezerwowany')).toBe('zarezerwowane');
    expect(parseDate('22.10.2026')).toBe('2026-10-22');
    expect(parseDate('2026-10-22')).toBe('2026-10-22');
    expect(parseDate('5/3/27')).toBe('2027-03-05');
    expect(parseDate('wkrótce')).toBeUndefined();
    expect(norm('Żółć GĘŚLĄ')).toBe('zolc gesla');
  });
});

describe('odczyt pliku', () => {
  it('wykrywa kodowanie Windows-1250 i usuwa BOM', () => {
    // „Zażółć” w Windows-1250: Z a ż ó ł ć
    const cp1250 = Uint8Array.from([0x5a, 0x61, 0xbf, 0xf3, 0xb3, 0xe6]);
    expect(decodeText(cp1250)).toBe('Zażółć');
    const withBom = new TextEncoder().encode('﻿Tytuł');
    expect(decodeText(withBom)).toBe('Tytuł');
  });

  it('wykrywa separator (średnik, przecinek, tabulator) i pomija puste wiersze', () => {
    for (const sep of [';', ',', '\t']) {
      const t = parseCsv(`Tytuł${sep}Artysta\n\nA${sep}B\n`);
      expect(t.headers).toEqual(['Tytuł', 'Artysta']);
      expect(t.rows).toHaveLength(1);
      expect(t.rows[0].cells).toEqual(['A', 'B']);
    }
  });

  it('zgłasza czytelny błąd dla pustego pliku i samych nagłówków', () => {
    expect(() => parseCsv('')).toThrow(/pusty/);
    expect(() => parseCsv('Tytuł;Artysta\n')).toThrow(/nagłówki/);
  });

  it('toTable obsługuje komórki liczbowe i daty z XLSX', () => {
    const t = toTable([['Tytuł', 'Cena', 'Data'], ['A', 1200.5, new Date(2026, 9, 22)]]);
    expect(t.rows[0].cells).toEqual(['A', '1200.5', '2026-10-22']);
  });
});

describe('automatyczne mapowanie kolumn', () => {
  it('dopasowuje nagłówki z typowego polskiego pliku', () => {
    const t = sample();
    const m = autoMap(t.headers);
    const col = (k: keyof typeof m) => (m[k] === undefined ? undefined : t.headers[m[k]!]);
    expect(col('title')).toBe('Tytuł');
    expect(col('artist')).toBe('Autor');
    expect(col('year')).toBe('Rok powstania');
    expect(col('category')).toBe('Rodzaj');
    expect(col('technique')).toBe('Technika');
    expect(col('dimensions')).toBe('Wymiary');
    expect(col('salePrice')).toBe('Cena');
    expect(col('status')).toBe('Status');
    expect(col('location')).toBe('Miejsce');
    expect(col('description')).toBe('Opis');
    expect(col('oldInvNo')).toBe('Lp');
    expect(unmappedRequired(m)).toEqual([]);
  });

  it('cena zakupu i minimalna nie są brane za cenę sprzedaży', () => {
    const m = autoMap(['Nazwa', 'Autor', 'Cena zakupu', 'Cena minimalna', 'Cena sprzedaży (PLN)', 'Szerokość [cm]', 'Wysokość [cm]']);
    expect(m.purchasePrice).toBe(2);
    expect(m.minPrice).toBe(3);
    expect(m.salePrice).toBe(4);
    expect(m.width).toBe(5);
    expect(m.height).toBe(6);
    expect(m.title).toBe(0);
  });

  it('„stan zachowania” nie jest mylony ze statusem', () => {
    expect(autoMap(['Tytuł', 'Stan zachowania']).status).toBeUndefined();
  });

  it('każda kolumna trafia do co najwyżej jednego pola', () => {
    const m = autoMap(sample().headers);
    const idx = Object.values(m);
    expect(new Set(idx).size).toBe(idx.length);
    expect(FIELDS.length).toBeGreaterThan(10);
  });
});

describe('plan importu na próbce', () => {
  const plan = () => {
    const t = sample();
    return buildPlan(t, autoMap(t.headers), DEFAULT_OPTIONS, []);
  };

  it('zlicza gotowe, do uzupełnienia i duplikaty', () => {
    const p = plan();
    expect(p.rows).toHaveLength(8);
    expect(p.duplicates).toBe(1); // wiersz 6 powtarza wiersz 1
    expect(p.incomplete).toBe(3); // brak tytułu (4), brak wymiarów (7), brak ceny (8)
    expect(p.ready).toBe(4);
  });

  it('poprawnie czyta dane z gotowych wierszy', () => {
    const [first, second, third, , fifth] = plan().rows;
    expect(first.input).toMatchObject({
      title: 'Zima w Krakowie',
      artist: 'Jan Kowalski',
      year: 2021,
      category: 'malarstwo',
      salePrice: 12500,
      currency: 'PLN',
      status: 'dostepne',
      location: 'sala_wystawowa',
      dimensionsCm: { w: 60, h: 80 },
    });
    expect(first.oldInvNo).toBe('1');
    expect(first.input.description).toContain('Nr z poprzedniego programu: 1');
    expect(second.input).toMatchObject({ status: 'w_magazynie', location: 'magazyn', year: 1998, category: 'rysunek' });
    expect(second.input.dimensionsCm).toMatchObject({ w: 42, h: 59.4 });
    // € w komórce ceny → EUR; rezerwacja bez daty → status Dostępne + ostrzeżenie
    expect(third.input).toMatchObject({ currency: 'EUR', salePrice: 900, status: 'dostepne', dimensionsCm: { w: 30, h: 40, d: 2 } });
    expect(third.warnings.join(' ')).toMatch(/Rezerwacja bez daty/);
    expect(fifth.input).toMatchObject({ status: 'sprzedane', salePrice: 12000, category: 'rzezba' });
  });

  it('rekordy z brakami dostają listę braków i wartości zastępcze', () => {
    const p = plan();
    const noTitle = p.rows[3];
    expect(noTitle.status).toBe('incomplete');
    expect(noTitle.missing).toEqual(['title']);
    expect(noTitle.input.title).toBe('(bez tytułu)');
    expect(p.rows[6].missing).toEqual(['dimensions']);
    expect(p.rows[6].warnings.join(' ')).toMatch(/Nie rozpoznano wymiarów/);
    expect(p.rows[7].missing).toEqual(['salePrice']);
    expect(p.rows[7].warnings.join(' ')).toMatch(/Nie rozpoznano ceny/);
    expect(p.rows[7].warnings.join(' ')).toMatch(/lokalizacj/);
  });

  it('odwrócona kolejność wymiarów i wyłączone pomijanie duplikatów', () => {
    const t = sample();
    const p = buildPlan(t, autoMap(t.headers), { ...DEFAULT_OPTIONS, dimensionOrder: 'hw', skipDuplicates: false }, []);
    expect(p.rows[0].input.dimensionsCm).toMatchObject({ w: 80, h: 60 });
    expect(p.duplicates).toBe(0);
  });

  it('pomija dzieła, które już są w katalogu (bez względu na wielkość liter i polskie znaki)', () => {
    const t = sample();
    const p = buildPlan(t, autoMap(t.headers), DEFAULT_OPTIONS, [{ title: 'ŻÓŁTY DOM', artist: 'lukasz zolkiewski' }]);
    expect(p.rows[1].status).toBe('duplicate');
  });

  it('osobne kolumny szerokość/wysokość mają pierwszeństwo przed kolumną „Wymiary”', () => {
    const t = parseCsv('Tytuł;Artysta;Szerokość;Wysokość;Cena\nA;B;50;70;100');
    const p = buildPlan(t, autoMap(t.headers), DEFAULT_OPTIONS, []);
    expect(p.rows[0]).toMatchObject({ status: 'ready', input: { dimensionsCm: { w: 50, h: 70 } } });
  });
});

describe('zapis planu w katalogu', () => {
  beforeEach(async () => {
    await Promise.all([db.artworks.clear(), db.photos.clear(), db.outbox.clear(), db.prices.clear()]);
  });

  it('importuje wszystko poza duplikatami, oznacza braki i dokłada do kolejki wysyłki', async () => {
    const t = sample();
    const plan = buildPlan(t, autoMap(t.headers), DEFAULT_OPTIONS, []);
    const result = await importPlan(plan, { isAdmin: true });
    expect(result).toEqual({ imported: 7, incomplete: 3, skippedDuplicates: 1 });

    const all = await db.artworks.toArray();
    expect(all).toHaveLength(7);
    expect(all.every((a) => a.photoIds.length === 0 && a.invNoProvisional)).toBe(true);
    expect(all.filter((a) => a.needsCompletion?.length)).toHaveLength(3);
    expect((await db.outbox.where('entity').equals('artwork').count())).toBe(7);
  });

  it('ceny wewnętrzne z pliku zapisuje tylko admin', async () => {
    const t = parseCsv('Tytuł;Artysta;Wymiary;Cena;Cena zakupu;Cena minimalna\nA;B;10x10;100;40;80');
    const plan = buildPlan(t, autoMap(t.headers), DEFAULT_OPTIONS, []);
    await importPlan(plan, { isAdmin: false });
    expect(await db.prices.count()).toBe(0);

    await db.artworks.clear();
    await importPlan(plan, { isAdmin: true });
    expect(await db.prices.toArray()).toMatchObject([{ purchasePrice: 40, minPrice: 80 }]);
  });
});
