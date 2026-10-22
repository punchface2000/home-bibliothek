import { describe, expect, it } from 'vitest';
import { datesConflict, formatFlexDate, isFlexDate, parseFlexDate, todayFlex } from './dates';

const now = new Date(2026, 9, 22);
const p = (s: string) => parseFlexDate(s, now);

describe('parseFlexDate', () => {
  it('reads a year alone', () => {
    expect(p('2019')).toBe('2019');
    expect(p(' 1998 ')).toBe('1998');
  });

  it('reads month and year in many forms', () => {
    expect(p('3.2019')).toBe('2019-03');
    expect(p('03.2019')).toBe('2019-03');
    expect(p('03/2019')).toBe('2019-03');
    expect(p('3,2019')).toBe('2019-03'); // German iPhone number pad has a comma
    expect(p('2019-03')).toBe('2019-03');
    expect(p('März 2019')).toBe('2019-03');
    expect(p('maerz 2019')).toBe('2019-03');
    expect(p('Mar 2019')).toBe('2019-03');
    expect(p('Okt. 2020')).toBe('2020-10');
    expect(p('December 2001')).toBe('2001-12');
  });

  it('reads full dates, day first', () => {
    expect(p('14.3.2019')).toBe('2019-03-14');
    expect(p('14/03/2019')).toBe('2019-03-14');
    expect(p('2019-03-14')).toBe('2019-03-14');
    expect(p('14 März 2019')).toBe('2019-03-14');
    expect(p('14 Mar 2019')).toBe('2019-03-14');
    expect(p('March 14 2019')).toBe('2019-03-14');
  });

  it('handles two-digit years', () => {
    expect(p('3.19')).toBe('2019-03');
    expect(p('5.26')).toBe('2026-05');
    expect(p('5.85')).toBe('1985-05');
  });

  it('rejects nonsense and impossible dates', () => {
    expect(p('')).toBe('');
    expect(p('   ')).toBe('');
    expect(p('March')).toBeNull();
    expect(p('14')).toBeNull();
    expect(p('13.2019')).toBeNull();
    expect(p('31.2.2019')).toBeNull();
    expect(p('29.2.2023')).toBeNull();
    expect(p('29.2.2024')).toBe('2024-02-29');
    expect(p('1.1.1500')).toBeNull();
    expect(p('hello world')).toBeNull();
    expect(p('1.2.3.4')).toBeNull();
  });
});

describe('formatFlexDate', () => {
  it('formats per language and precision', () => {
    expect(formatFlexDate('2019', 'de')).toBe('2019');
    expect(formatFlexDate('2019-03', 'de')).toBe('03.2019');
    expect(formatFlexDate('2019-03-04', 'de')).toBe('04.03.2019');
    expect(formatFlexDate('2019-03', 'en')).toBe('Mar 2019');
    expect(formatFlexDate('2019-03-04', 'en')).toBe('4 Mar 2019');
    expect(formatFlexDate(undefined, 'en')).toBe('');
  });

  it('round-trips through the parser', () => {
    for (const s of ['2019', '2019-03', '2019-03-04', '2024-02-29']) {
      expect(p(formatFlexDate(s, 'de'))).toBe(s);
      expect(p(formatFlexDate(s, 'en'))).toBe(s);
    }
  });
});

describe('helpers', () => {
  it('validates stored values', () => {
    expect(isFlexDate('2019')).toBe(true);
    expect(isFlexDate('2019-12')).toBe(true);
    expect(isFlexDate('2019-02-30')).toBe(false);
    expect(isFlexDate('19')).toBe(false);
    expect(isFlexDate(2019)).toBe(false);
  });

  it('gives today', () => {
    expect(todayFlex(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('detects finished before started only when certain', () => {
    expect(datesConflict('2019-05', '2019-03')).toBe(true);
    expect(datesConflict('2019', '2018-12-31')).toBe(true);
    expect(datesConflict('2019', '2019-01')).toBe(false);
    expect(datesConflict('2019-05-10', '2019-05')).toBe(false);
    expect(datesConflict('2019-05-10', '2019-05-09')).toBe(true);
    expect(datesConflict(undefined, '2019')).toBe(false);
  });
});
