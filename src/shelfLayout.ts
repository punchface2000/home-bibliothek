/**
 * Bookcase layout: how wide and tall each spine is, how books are packed
 * onto planks, how many planks fill the space, and where bookends and
 * decorations go on free space. Pure functions, no DOM.
 */
import { hash } from './color';
import type { Book } from './library';

/** Spine width in px at full size, from the page count (thin paperback … thick tome). */
export function spineWidth(b: Pick<Book, 'id' | 'pages'>): number {
  const pages = b.pages ?? 180 + (hash(b.id) % 260);
  return Math.round(Math.min(46, Math.max(16, 12 + pages / 22)));
}

/** Spine height as a fraction of the shelf height, varied a little per book. */
export function spineHeight(b: Pick<Book, 'id' | 'title'>): number {
  return 0.74 + (hash(b.title + b.id) % 22) / 100;
}

/** Greedy packing of widths into rows of a given width. Returns indices per row. */
export function packRows(widths: number[], rowWidth: number, gap = 1): number[][] {
  const rows: number[][] = [];
  let row: number[] = [];
  let used = 0;
  widths.forEach((w, i) => {
    const need = row.length ? w + gap : w;
    if (row.length && used + need > rowWidth) {
      rows.push(row);
      row = [];
      used = 0;
    }
    used += row.length ? w + gap : w;
    row.push(i);
  });
  if (row.length) rows.push(row);
  return rows;
}

/** Width used by a packed row. */
export function rowUsed(widths: number[], row: number[], gap = 1): number {
  return row.reduce((s, i, k) => s + widths[i] + (k ? gap : 0), 0);
}

/**
 * How many planks fit in `available` px if each row (books + plank) is about
 * `rowTotal` px. Returns the count and the stretched row height so the rows
 * fill the space exactly.
 */
export function fitRows(available: number, rowTotal: number, plank: number, min = 3): { rows: number; rowHeight: number } {
  const rows = Math.max(min, Math.floor(available / rowTotal));
  const rowHeight = Math.max(20, Math.floor(available / rows) - plank);
  return { rows, rowHeight };
}

/* ------------------------------------------------------------------ */
/* Decorations                                                        */
/* ------------------------------------------------------------------ */

export type DecorKind = 'plant' | 'vase' | 'stack' | 'globe' | 'frame' | 'clock' | 'candle';

/** Size of each decoration as a fraction of the row height (width, height). */
export const DECOR_SIZE: Record<DecorKind, [number, number]> = {
  plant: [0.42, 0.56],
  vase: [0.24, 0.62],
  stack: [0.62, 0.3],
  globe: [0.42, 0.6],
  frame: [0.4, 0.5],
  clock: [0.34, 0.42],
  candle: [0.2, 0.5]
};
const KINDS = Object.keys(DECOR_SIZE) as DecorKind[];

/** Bookend width as a fraction of the row height. */
export const BOOKEND_W = 0.09;

export interface RowDecor {
  bookend: boolean;
  decor?: { kind: DecorKind; align: 'start' | 'center' | 'end' };
}

/** Small deterministic random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Plan bookends and decorations for every row of a case.
 * - rows with books get a bookend if there's room, sometimes an ornament at the far end;
 * - empty rows below books sometimes get an ornament;
 * - a completely empty case gets ornaments on most rows, so it still looks lived-in.
 * The same seed always gives the same result, so shelves don't reshuffle.
 */
export function planDecor(used: number[], rowWidth: number, rowHeight: number, seed: string): RowDecor[] {
  const rand = rng(hash(seed));
  const emptyCase = used.every((u) => u === 0);
  let last: DecorKind | null = null;
  const pick = (free: number): DecorKind | null => {
    const fits = KINDS.filter((k) => k !== last && DECOR_SIZE[k][0] * rowHeight + rowHeight * 0.12 <= free);
    if (!fits.length) return null;
    const k = fits[Math.floor(rand() * fits.length)];
    last = k;
    return k;
  };
  let bare = 0; // empty rows in a row without anything on them
  return used.map((u) => {
    const r = rand();
    if (u > 0) {
      let free = rowWidth - u;
      const bookend = free >= BOOKEND_W * rowHeight + 4;
      if (bookend) free -= BOOKEND_W * rowHeight + 4;
      if (r < 0.5) {
        const kind = pick(free);
        if (kind) return { bookend, decor: { kind, align: 'end' } };
      }
      return { bookend };
    }
    // never leave more than two empty planks in a row completely bare
    if (r < (emptyCase ? 0.75 : 0.55) || bare >= 2) {
      const kind = pick(rowWidth);
      const a = rand();
      if (kind) {
        bare = 0;
        return { bookend: false, decor: { kind, align: a < 0.34 ? 'start' : a < 0.67 ? 'center' : 'end' } };
      }
    }
    bare++;
    return { bookend: false };
  });
}
