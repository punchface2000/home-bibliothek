/** Reading statistics and "year in review". Pure functions, no DOM. */
import type { Book } from './library';

export interface YearStats {
  /** the year looked at, or 'all' */
  year: number | 'all';
  /** books finished in that year (or all read books) */
  books: Book[];
  count: number;
  pages: number;
  /** books in the selection whose page count is unknown */
  pagesUnknown: number;
  avgRating?: number;
  /** count of books per star (index 0 = 1 star … 4 = 5 stars; halves round up) */
  ratingBuckets: number[];
  topRated: Book[];
  topAuthors: { author: string; count: number }[];
  longest?: Book;
  shortest?: Book;
  /** books per month (index 0 = January), only when the month is known; only for a single year */
  perMonth?: number[];
  /** read books in this selection without a finish date */
  undated: number;
}

export interface LibraryStats {
  total: number;
  owned: number;
  wishlist: number;
  lent: number;
  reading: number;
  toread: number;
  /** pages still to go: unread pages of books being read + to-read books */
  pagesToGo: number;
  /** books finished per year, newest first */
  perYear: { year: number; count: number; pages: number }[];
  /** read books without a finish date */
  undated: number;
}

export function finishedYear(b: Book): number | undefined {
  return b.finished ? Number(b.finished.slice(0, 4)) : undefined;
}

function finishedMonth(b: Book): number | undefined {
  return b.finished && b.finished.length >= 7 ? Number(b.finished.slice(5, 7)) : undefined;
}

export function libraryStats(books: Book[]): LibraryStats {
  const read = books.filter((b) => b.status === 'read');
  const years = new Map<number, { year: number; count: number; pages: number }>();
  let undated = 0;
  for (const b of read) {
    const y = finishedYear(b);
    if (y === undefined) {
      undated++;
      continue;
    }
    const e = years.get(y) ?? { year: y, count: 0, pages: 0 };
    e.count++;
    e.pages += b.pages ?? 0;
    years.set(y, e);
  }
  let pagesToGo = 0;
  for (const b of books) {
    if (b.status === 'reading' && b.pages) pagesToGo += Math.max(0, b.pages - (b.currentPage ?? 0));
    if (b.status === 'toread' && b.owned && b.pages) pagesToGo += b.pages;
  }
  return {
    total: books.length,
    owned: books.filter((b) => b.owned).length,
    wishlist: books.filter((b) => !b.owned).length,
    lent: books.filter((b) => b.lentTo).length,
    reading: books.filter((b) => b.status === 'reading').length,
    toread: books.filter((b) => b.status === 'toread').length,
    pagesToGo,
    perYear: [...years.values()].sort((a, b) => b.year - a.year),
    undated
  };
}

export function yearStats(books: Book[], year: number | 'all'): YearStats {
  const read = books.filter((b) => b.status === 'read');
  const sel = year === 'all' ? read : read.filter((b) => finishedYear(b) === year);
  const withPages = sel.filter((b) => b.pages);
  const rated = sel.filter((b) => b.rating);
  const ratingBuckets = [0, 0, 0, 0, 0];
  for (const b of rated) ratingBuckets[Math.min(5, Math.ceil(b.rating!)) - 1]++;
  const authors = new Map<string, number>();
  for (const b of sel) if (b.authors[0]) authors.set(b.authors[0], (authors.get(b.authors[0]) ?? 0) + 1);
  const byPages = [...withPages].sort((a, b) => b.pages! - a.pages!);
  let perMonth: number[] | undefined;
  if (year !== 'all') {
    perMonth = Array(12).fill(0);
    for (const b of sel) {
      const m = finishedMonth(b);
      if (m) perMonth[m - 1]++;
    }
  }
  return {
    year,
    books: sel,
    count: sel.length,
    pages: withPages.reduce((s, b) => s + b.pages!, 0),
    pagesUnknown: sel.length - withPages.length,
    avgRating: rated.length ? Math.round((rated.reduce((s, b) => s + b.rating!, 0) / rated.length) * 10) / 10 : undefined,
    ratingBuckets,
    topRated: [...rated].sort((a, b) => b.rating! - a.rating! || (b.finished ?? '').localeCompare(a.finished ?? '')).slice(0, 5),
    topAuthors: [...authors.entries()]
      .map(([author, count]) => ({ author, count }))
      .filter((a) => a.count > 1)
      .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author))
      .slice(0, 5),
    longest: byPages[0],
    shortest: byPages.length > 1 ? byPages[byPages.length - 1] : undefined,
    perMonth,
    undated: year === 'all' ? sel.filter((b) => !b.finished).length : 0
  };
}
