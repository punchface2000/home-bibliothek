/** ISBN helpers. Pure functions, no DOM. */

/** Strip spaces and dashes, uppercase a trailing x. */
export function cleanIsbn(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidIsbn10(s: string): boolean {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const d = s[i] === 'X' ? 10 : Number(s[i]);
    sum += d * (10 - i);
  }
  return sum % 11 === 0;
}

export function isValidIsbn13(s: string): boolean {
  if (!/^97[89]\d{10}$/.test(s)) return false;
  return ean13CheckDigit(s.slice(0, 12)) === Number(s[12]);
}

/** Check digit for the first 12 digits of an EAN-13. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

export function isbn10To13(s: string): string {
  const base = '978' + s.slice(0, 9);
  return base + ean13CheckDigit(base);
}

/** Return a normalized ISBN-13 if `raw` is a valid ISBN-10 or ISBN-13, else null. */
export function normalizeIsbn(raw: string): string | null {
  const s = cleanIsbn(raw);
  if (isValidIsbn13(s)) return s;
  if (isValidIsbn10(s)) return isbn10To13(s);
  return null;
}

/**
 * Pick the ISBN out of a scanned barcode value. Book barcodes are EAN-13
 * starting with 978/979; some scanners also return the 5-digit price add-on
 * glued to the end, so look for a valid 13-digit run inside the text.
 */
export function isbnFromBarcode(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  for (let i = 0; i + 13 <= digits.length; i++) {
    const cand = digits.slice(i, i + 13);
    if (isValidIsbn13(cand)) return cand;
  }
  return normalizeIsbn(value);
}

/** Does the text look like the user typed an ISBN (rather than a title)? */
export function looksLikeIsbn(text: string): boolean {
  return normalizeIsbn(text) !== null;
}
