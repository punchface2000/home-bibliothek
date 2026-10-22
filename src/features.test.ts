import { describe, expect, it } from 'vitest';
import {
  addBook,
  allSeries,
  allTags,
  cleanTags,
  countBooks,
  emptyLibrary,
  filterBooks,
  isDigital,
  moveBooks,
  nextInSeries,
  pickRandom,
  readNextPool,
  removeBooks,
  reorderIds,
  sanitizeLibrary,
  searchBooks,
  seriesBooks,
  setShelfOrder,
  setShelfSort,
  sortBooks,
  wishlistText,
  type BookInput,
  type Library
} from './library';
import { libraryStats, yearStats } from './stats';
import { rng } from './shelfLayout';

function lib(inputs: BookInput[]): Library {
  let l = emptyLibrary(['A', 'B'], 0);
  inputs.forEach((b, i) => (l = addBook(l, { shelfId: l.shelves[0].id, ...b }, 1000 + i).lib));
  return l;
}

describe('new book fields', () => {
  it('sanitizes lending, progress, series, tags, format, order, spine colour', () => {
    const l = sanitizeLibrary(
      {
        shelves: [{ id: 's', name: 'S' }],
        books: [
          { title: 'A', lentTo: ' Anna ', lentSince: '2026-03', currentPage: 120.4, series: 'Dune', seriesNo: 2, tags: ['Signed', ' signed', 'gift', 3], format: 'ebook', order: 4, spineColor: '#123456', spineManual: true },
          { title: 'B', lentSince: '2026', currentPage: -3, seriesNo: 5, format: 'scroll', spineManual: true }
        ]
      },
      ['X']
    );
    const [a, b] = l.books;
    expect(a).toMatchObject({ lentTo: 'Anna', lentSince: '2026-03', currentPage: 120, series: 'Dune', seriesNo: 2, tags: ['Signed', 'gift'], format: 'ebook', order: 4, spineManual: true });
    expect(b.lentSince).toBeUndefined(); // no one to lend to
    expect(b.currentPage).toBeUndefined();
    expect(b.seriesNo).toBeUndefined(); // no series name
    expect(b.format).toBeUndefined();
    expect(b.spineManual).toBeUndefined(); // no colour picked
    expect(b.tags).toEqual([]);
  });

  it('cleans tags', () => {
    expect(cleanTags(['  a  b ', 'A B', '', 'c'])).toEqual(['a b', 'c']);
    expect(cleanTags('nope')).toEqual([]);
  });

  it('knows digital formats', () => {
    expect(isDigital({ format: 'audiobook' })).toBe(true);
    expect(isDigital({ format: 'hardcover' })).toBe(false);
    expect(isDigital({})).toBe(false);
  });
});

describe('series', () => {
  const l = lib([
    { title: 'Children of Dune', authors: ['Frank Herbert'], series: 'Dune', seriesNo: 3, year: 1976 },
    { title: 'Dune', authors: ['Frank Herbert'], series: 'Dune', seriesNo: 1, year: 1965 },
    { title: 'The Dosadi Experiment', authors: ['Frank Herbert'], year: 1977 },
    { title: 'Dune Messiah', authors: ['Frank Herbert'], series: 'dune', seriesNo: 2, year: 1969 },
    { title: 'Whipping Star', authors: ['Frank Herbert'], year: 1970 }
  ]);

  it('keeps a series together and in order when sorting by author', () => {
    expect(sortBooks(l.books, 'author').map((b) => b.title)).toEqual(['Dune', 'Dune Messiah', 'Children of Dune', 'Whipping Star', 'The Dosadi Experiment']);
  });

  it('lists series books and finds the next volume', () => {
    expect(seriesBooks(l.books, 'DUNE').map((b) => b.seriesNo)).toEqual([1, 2, 3]);
    const first = l.books.find((b) => b.seriesNo === 1)!;
    expect(nextInSeries(l.books, first)?.book?.title).toBe('Dune Messiah');
    const third = l.books.find((b) => b.seriesNo === 3)!;
    expect(nextInSeries(l.books, third)).toEqual({ no: 4 });
    expect(nextInSeries(l.books, l.books[2])).toBeNull();
    expect(allSeries(l.books)).toHaveLength(1);
  });
});

describe('tags, lending, filters, search', () => {
  const l = lib([
    { title: 'Signed one', tags: ['signed', 'favourite'], lentTo: 'Anna' },
    { title: 'Gift', tags: ['Gift', 'Favourite'] },
    { title: 'Plain', owned: false }
  ]);

  it('counts tags and filters by tag / lending', () => {
    expect(allTags(l.books)).toEqual([
      { tag: 'favourite', count: 2 },
      { tag: 'Gift', count: 1 },
      { tag: 'signed', count: 1 }
    ]);
    expect(filterBooks(l.books, { tag: 'FAVOURITE' })).toHaveLength(2);
    expect(filterBooks(l.books, { lent: true }).map((b) => b.title)).toEqual(['Signed one']);
    expect(countBooks(l.books)).toMatchObject({ lent: 1, wishlist: 1 });
  });

  it('searches tags and the borrower', () => {
    expect(searchBooks(l.books, 'anna')[0].title).toBe('Signed one');
    expect(searchBooks(l.books, 'gift')[0].title).toBe('Gift');
  });
});

describe('several books, my order', () => {
  it('moves and removes many books', () => {
    let l = lib([{ title: 'a' }, { title: 'b' }, { title: 'c' }]);
    const [x, y] = l.books;
    l = moveBooks(l, [x.id, y.id], l.shelves[1].id, 5);
    expect(l.books.filter((b) => b.shelfId === l.shelves[1].id)).toHaveLength(2);
    expect(moveBooks(l, [x.id], 'nope')).toBe(l);
    l = removeBooks(l, [x.id, y.id]);
    expect(l.books.map((b) => b.title)).toEqual(['c']);
  });

  it('remembers a sort per shelf', () => {
    let l = lib([{ title: 'a' }]);
    l = setShelfSort(l, l.shelves[0].id, 'manual');
    expect(sanitizeLibrary(JSON.parse(JSON.stringify(l)), ['X']).shelves[0].sort).toBe('manual');
    expect(sanitizeLibrary({ shelves: [{ id: 's', name: 'S', sort: 'bogus' }], books: [] }, ['X']).shelves[0].sort).toBeUndefined();
  });

  it('reorders and sorts by my order', () => {
    let l = lib([{ title: 'a' }, { title: 'b' }, { title: 'c' }, { title: 'd' }]);
    const ids = l.books.map((b) => b.id);
    expect(reorderIds(ids, ids[3], ids[0])).toEqual([ids[3], ids[0], ids[1], ids[2]]);
    expect(reorderIds(ids, ids[0], null)).toEqual([ids[1], ids[2], ids[3], ids[0]]);
    l = setShelfOrder(l, reorderIds(ids, ids[2], ids[0]));
    expect(sortBooks(l.books, 'manual').map((b) => b.title)).toEqual(['c', 'a', 'b', 'd']);
    // a new book without a position goes to the end
    l = addBook(l, { title: 'e' }, 99999).lib;
    expect(sortBooks(l.books, 'manual').map((b) => b.title).pop()).toBe('e');
  });
});

describe('pick next and wishlist', () => {
  it('prefers owned to-read books that are not lent out', () => {
    const l = lib([{ title: 'own', status: 'toread' }, { title: 'lent', status: 'toread', lentTo: 'X' }, { title: 'wish', status: 'toread', owned: false }, { title: 'done', status: 'read' }]);
    expect(readNextPool(l.books).map((b) => b.title)).toEqual(['own']);
    const l2 = lib([{ title: 'wish', status: 'toread', owned: false }]);
    expect(readNextPool(l2.books).map((b) => b.title)).toEqual(['wish']);
  });

  it('picks randomly but avoids repeating', () => {
    const pool = [{ id: 'a' }, { id: 'b' }];
    const r = rng(1);
    for (let i = 0; i < 20; i++) expect(pickRandom(pool, r, 'a')?.id).toBe('b');
    expect(pickRandom([{ id: 'a' }], r, 'a')?.id).toBe('a');
    expect(pickRandom([], r)).toBeUndefined();
  });

  it('writes a wishlist text', () => {
    const l = lib([{ title: 'Stoner', authors: ['John Williams'], owned: false, isbn: '9781590171998' }, { title: 'Mine' }]);
    const t = wishlistText(l.books, 'en');
    expect(t).toContain('My book wishlist');
    expect(t).toContain('• Stoner — John Williams (ISBN 9781590171998)');
    expect(t).not.toContain('Mine');
    expect(wishlistText(l.books, 'de')).toContain('Wunschliste');
  });
});

describe('stats', () => {
  const l = lib([
    { title: 'A', authors: ['X'], status: 'read', finished: '2025-03-10', pages: 300, rating: 4.5 },
    { title: 'B', authors: ['X'], status: 'read', finished: '2025-03', pages: 100, rating: 3 },
    { title: 'C', authors: ['Y'], status: 'read', finished: '2025', rating: 5 },
    { title: 'D', authors: ['Z'], status: 'read', finished: '2024-12', pages: 500 },
    { title: 'E', authors: ['Z'], status: 'read' },
    { title: 'F', status: 'reading', pages: 400, currentPage: 150 },
    { title: 'G', status: 'toread', pages: 200 },
    { title: 'H', status: 'toread', pages: 999, owned: false }
  ]);

  it('summarises the library', () => {
    const s = libraryStats(l.books);
    expect(s.perYear).toEqual([
      { year: 2025, count: 3, pages: 400 },
      { year: 2024, count: 1, pages: 500 }
    ]);
    expect(s.undated).toBe(1);
    expect(s.pagesToGo).toBe(250 + 200);
    expect(s).toMatchObject({ total: 8, wishlist: 1, reading: 1, toread: 2 });
  });

  it('reviews a year', () => {
    const y = yearStats(l.books, 2025);
    expect(y.count).toBe(3);
    expect(y.pages).toBe(400);
    expect(y.pagesUnknown).toBe(1);
    expect(y.avgRating).toBe(4.2);
    expect(y.ratingBuckets).toEqual([0, 0, 1, 0, 2]);
    expect(y.topRated.map((b) => b.title)).toEqual(['C', 'A', 'B']);
    expect(y.topAuthors).toEqual([{ author: 'X', count: 2 }]);
    expect(y.longest?.title).toBe('A');
    expect(y.shortest?.title).toBe('B');
    expect(y.perMonth?.[2]).toBe(2);
  });

  it('reviews all time', () => {
    const a = yearStats(l.books, 'all');
    expect(a.count).toBe(5);
    expect(a.undated).toBe(1);
    expect(a.perMonth).toBeUndefined();
  });
});
