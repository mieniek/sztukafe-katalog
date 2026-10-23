import { pluralPl } from './plural';

const dziela = (n: number) => `${n} ${pluralPl(n, 'dzieło', 'dzieła', 'dzieł')}`;

describe('pluralPl', () => {
  it('odmienia dzieło/dzieła/dzieł', () => {
    expect(dziela(0)).toBe('0 dzieł');
    expect(dziela(1)).toBe('1 dzieło');
    expect(dziela(2)).toBe('2 dzieła');
    expect(dziela(4)).toBe('4 dzieła');
    expect(dziela(5)).toBe('5 dzieł');
    expect(dziela(12)).toBe('12 dzieł');
    expect(dziela(22)).toBe('22 dzieła');
    expect(dziela(112)).toBe('112 dzieł');
  });
});
