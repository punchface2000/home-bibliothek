import { describe, expect, it } from 'vitest';
import { resolveLang, STRINGS } from './i18n';

function shape(o: unknown): unknown {
  if (typeof o === 'function') return 'fn';
  if (o && typeof o === 'object') return Object.fromEntries(Object.keys(o).sort().map((k) => [k, shape((o as Record<string, unknown>)[k])]));
  return typeof o;
}

describe('i18n', () => {
  it('English and German have the same keys', () => {
    expect(shape(STRINGS.de)).toEqual(shape(STRINGS.en));
  });

  it('resolves auto language', () => {
    expect(resolveLang('auto', ['de-DE', 'en'])).toBe('de');
    expect(resolveLang('auto', ['vi-VN', 'en-US'])).toBe('en');
    expect(resolveLang('auto', ['fr'])).toBe('en');
    expect(resolveLang('de', ['en'])).toBe('de');
  });

  it('formats counts', () => {
    expect(STRINGS.en.books(1)).toBe('1 book');
    expect(STRINGS.de.books(3)).toBe('3 Bücher');
  });
});
