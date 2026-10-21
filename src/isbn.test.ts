import { describe, expect, it } from 'vitest';
import { ean13CheckDigit, isbn10To13, isbnFromBarcode, isValidIsbn10, isValidIsbn13, looksLikeIsbn, normalizeIsbn } from './isbn';

describe('isbn', () => {
  it('validates ISBN-13', () => {
    expect(isValidIsbn13('9783423282383')).toBe(true);
    expect(isValidIsbn13('9783423282384')).toBe(false);
    expect(isValidIsbn13('1234567890123')).toBe(false);
  });

  it('validates ISBN-10 including X', () => {
    expect(isValidIsbn10('0306406152')).toBe(true);
    expect(isValidIsbn10('080442957X')).toBe(true);
    expect(isValidIsbn10('0306406153')).toBe(false);
  });

  it('converts 10 to 13', () => {
    expect(isbn10To13('0306406152')).toBe('9780306406157');
    expect(ean13CheckDigit('978030640615')).toBe(7);
  });

  it('normalizes with dashes and spaces', () => {
    expect(normalizeIsbn('978-3-423-28238-3')).toBe('9783423282383');
    expect(normalizeIsbn(' 0-306-40615-2 ')).toBe('9780306406157');
    expect(normalizeIsbn('hello')).toBeNull();
  });

  it('extracts ISBN from barcode with price add-on', () => {
    expect(isbnFromBarcode('978342328238351299')).toBe('9783423282383');
    expect(isbnFromBarcode('9783423282383')).toBe('9783423282383');
    expect(isbnFromBarcode('4006381333931')).toBeNull(); // a non-book EAN
  });

  it('detects typed ISBNs', () => {
    expect(looksLikeIsbn('9783423282383')).toBe(true);
    expect(looksLikeIsbn('Der Process')).toBe(false);
  });
});
