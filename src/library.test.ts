import { describe, expect, it } from 'vitest';
import {
  addBook,
  addQuote,
  addShelf,
  authorSortKey,
  countBooks,
  deleteShelf,
  emptyLibrary,
  findDuplicate,
  mergeLibraries,
  moveShelf,
  normalizeText,
  ratingFromX,
  recommendationPrompt,
  removeBook,
  removeQuote,
  renameShelf,
  sanitizeLibrary,
  searchBooks,
  similarPrompt,
  sortBooks,
  updateBook,
  type Library
} from './library';

function sample(): Library {
  let lib = emptyLibrary(['My books', 'Wishlist'], 1000);
  const [main, wish] = lib.shelves;
  const add = (input: Parameters<typeof addBook>[1], t: number) => (lib = addBook(lib, input, t).lib);
  add({ title: 'Der Zauberberg', authors: ['Thomas Mann'], year: 1924, isbn: '9783596294336', shelfId: main.id, status: 'read', rating: 4.5, remarks: 'Langsam, aber großartig' }, 2000);
  add({ title: 'The Remains of the Day', authors: ['Kazuo Ishiguro'], year: 1989, shelfId: main.id, status: 'reading' }, 3000);
  add({ title: 'Buddenbrooks', authors: ['Thomas Mann'], year: 1901, shelfId: main.id, status: 'toread' }, 4000);
  add({ title: 'Stoner', authors: ['John Williams'], shelfId: wish.id, owned: false, subjects: ['Campus fiction'] }, 5000);
  return lib;
}

describe('sanitizeLibrary', () => {
  it('creates defaults from garbage', () => {
    const lib = sanitizeLibrary(null, ['A', 'B']);
    expect(lib.shelves.map((s) => s.name)).toEqual(['A', 'B']);
    expect(lib.books).toEqual([]);
  });

  it('repairs old or partial data without losing books', () => {
    const lib = sanitizeLibrary(
      {
        shelves: [{ id: 's1', name: 'Mine' }],
        books: [
          { id: 'b1', title: 'Old book', shelfId: 'gone', status: 'weird', rating: 3.3, started: 'yesterday' },
          { title: '' },
          'nonsense',
          { id: 'b1', title: 'duplicate id' }
        ]
      },
      ['X']
    );
    expect(lib.shelves).toHaveLength(1);
    expect(lib.books).toHaveLength(1);
    const b = lib.books[0];
    expect(b.shelfId).toBe('s1');
    expect(b.status).toBe('toread');
    expect(b.rating).toBe(3.5);
    expect(b.started).toBeUndefined();
    expect(b.owned).toBe(true);
    expect(b.quotes).toEqual([]);
  });

  it('keeps partial reading dates (year, month) and drops invalid ones', () => {
    const lib = sanitizeLibrary({ shelves: [{ id: 's', name: 'S' }], books: [{ title: 'A', started: '2019', finished: '2019-03' }, { title: 'B', started: '2019-13', finished: '14.3.2019' }] }, ['X']);
    expect(lib.books[0]).toMatchObject({ started: '2019', finished: '2019-03' });
    expect(lib.books[1].started).toBeUndefined();
    expect(lib.books[1].finished).toBeUndefined();
  });

  it('keeps at least one shelf', () => {
    const lib = sanitizeLibrary({ shelves: [], books: [{ title: 'x' }] }, ['Default']);
    expect(lib.shelves[0].name).toBe('Default');
    expect(lib.books[0].shelfId).toBe(lib.shelves[0].id);
  });
});

describe('shelves', () => {
  it('adds, renames, reorders and deletes', () => {
    let lib = sample();
    const r = addShelf(lib, '  Krimis ');
    lib = r.lib;
    expect(r.shelf.name).toBe('Krimis');
    lib = renameShelf(lib, r.shelf.id, 'Crime');
    expect(lib.shelves[2].name).toBe('Crime');
    lib = renameShelf(lib, r.shelf.id, '   ');
    expect(lib.shelves[2].name).toBe('Crime');
    lib = moveShelf(lib, r.shelf.id, -1);
    expect(lib.shelves[1].id).toBe(r.shelf.id);
    expect(moveShelf(lib, lib.shelves[0].id, -1)).toBe(lib);
  });

  it('moves books when a shelf is deleted, never deletes the last shelf', () => {
    let lib = sample();
    const [main, wish] = lib.shelves;
    lib = deleteShelf(lib, wish.id, main.id);
    expect(lib.shelves).toHaveLength(1);
    expect(lib.books.every((b) => b.shelfId === main.id)).toBe(true);
    expect(deleteShelf(lib, main.id)).toBe(lib);
  });
});

describe('books', () => {
  it('adds with defaults and updates', () => {
    let lib = emptyLibrary(['A'], 0);
    const { lib: l2, book } = addBook(lib, { title: 'Momo', authors: ['Michael Ende'] }, 10);
    lib = l2;
    expect(book.shelfId).toBe(lib.shelves[0].id);
    expect(book.status).toBe('toread');
    expect(book.addedAt).toBe(10);
    lib = updateBook(lib, book.id, { status: 'read', rating: 5, finished: '2026-10-01' }, 20);
    let b = lib.books[0];
    expect(b.status).toBe('read');
    expect(b.updatedAt).toBe(20);
    lib = updateBook(lib, book.id, { rating: undefined }, 30);
    b = lib.books[0];
    expect(b.rating).toBeUndefined();
    expect(b.finished).toBe('2026-10-01');
    lib = removeBook(lib, book.id);
    expect(lib.books).toHaveLength(0);
  });

  it('adds and removes quotes', () => {
    let lib = sample();
    const id = lib.books[0].id;
    lib = addQuote(lib, id, '  Zeit ist ein Geheimnis ', ' 12 ');
    lib = addQuote(lib, id, '   ');
    const q = lib.books[0].quotes;
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ text: 'Zeit ist ein Geheimnis', page: '12' });
    lib = removeQuote(lib, id, q[0].id);
    expect(lib.books[0].quotes).toHaveLength(0);
  });

  it('finds duplicates by ISBN or title + author', () => {
    const lib = sample();
    expect(findDuplicate(lib, { isbn: '9783596294336', title: 'whatever' })?.title).toBe('Der Zauberberg');
    expect(findDuplicate(lib, { title: 'der zauberberg', authors: ['Thomas Mann'] })).toBeDefined();
    expect(findDuplicate(lib, { title: 'Der Zauberberg', authors: ['Someone Else'] })).toBeUndefined();
  });
});

describe('sorting and searching', () => {
  it('sorts by author last name, title without articles, rating', () => {
    const lib = sample();
    expect(sortBooks(lib.books, 'author').map((b) => b.title)).toEqual(['The Remains of the Day', 'Buddenbrooks', 'Der Zauberberg', 'Stoner']);
    expect(sortBooks(lib.books, 'title').map((b) => b.title)).toEqual(['Buddenbrooks', 'The Remains of the Day', 'Stoner', 'Der Zauberberg']);
    expect(sortBooks(lib.books, 'rating')[0].title).toBe('Der Zauberberg');
    expect(sortBooks(lib.books, 'added')[0].title).toBe('Stoner');
    expect(authorSortKey('Mann, Thomas')).toBe('mann thomas');
  });

  it('normalizes umlauts and ß', () => {
    expect(normalizeText('Großartig Über-Ich!')).toBe('grossartig uber ich');
  });

  it('searches title, author, remarks, subjects and ISBN', () => {
    const lib = sample();
    expect(searchBooks(lib.books, 'mann').map((b) => b.title).sort()).toEqual(['Buddenbrooks', 'Der Zauberberg']);
    expect(searchBooks(lib.books, 'zauber')[0].title).toBe('Der Zauberberg');
    expect(searchBooks(lib.books, 'grossartig')[0].title).toBe('Der Zauberberg');
    expect(searchBooks(lib.books, 'campus')[0].title).toBe('Stoner');
    expect(searchBooks(lib.books, '978-3-596-29433-6')[0].title).toBe('Der Zauberberg');
    expect(searchBooks(lib.books, 'mann stoner')).toEqual([]);
    expect(searchBooks(lib.books, '   ')).toEqual([]);
  });

  it('counts by status and wishlist', () => {
    const c = countBooks(sample().books);
    expect(c).toMatchObject({ total: 4, read: 1, reading: 1, toread: 2, abandoned: 0, wishlist: 1 });
  });
});

describe('mergeLibraries', () => {
  it('adds new books and keeps the newer version of shared ones', () => {
    const a = sample();
    const b: Library = JSON.parse(JSON.stringify(a));
    b.books[0] = { ...b.books[0], rating: 2, updatedAt: 99999 };
    b.books[1] = { ...b.books[1], rating: 1, updatedAt: 1 };
    b.books.push({ ...b.books[2], id: 'new-one', title: 'Lotte in Weimar' });
    b.shelves.push({ id: 'extra', name: 'Extra', createdAt: 0 });
    const r = mergeLibraries(a, b);
    expect(r.added).toBe(1);
    expect(r.updated).toBe(1);
    expect(r.lib.books).toHaveLength(5);
    expect(r.lib.books.find((x) => x.id === a.books[0].id)?.rating).toBe(2);
    expect(r.lib.books.find((x) => x.id === a.books[1].id)?.rating).toBeUndefined();
    expect(r.lib.shelves.map((s) => s.id)).toContain('extra');
  });
});

describe('ratingFromX', () => {
  it('maps taps to half stars', () => {
    expect(ratingFromX(1, 100)).toBe(0.5);
    expect(ratingFromX(15, 100)).toBe(1);
    expect(ratingFromX(50, 100)).toBe(2.5);
    expect(ratingFromX(99, 100)).toBe(5);
    expect(ratingFromX(-5, 100)).toBe(0.5);
    expect(ratingFromX(500, 100)).toBe(5);
  });
});

describe('prompts', () => {
  it('builds a recommendation prompt in both languages', () => {
    const lib = sample();
    const en = recommendationPrompt(lib, 'en');
    expect(en).toContain('Der Zauberberg — Thomas Mann (4.5/5)');
    expect(en).toContain('Currently reading:');
    expect(en).toContain('Stoner');
    const de = recommendationPrompt(lib, 'de');
    expect(de).toContain('Gelesen');
    expect(recommendationPrompt(emptyLibrary(['x']), 'en')).toContain('empty');
  });

  it('stays within the size budget', () => {
    let lib = emptyLibrary(['A']);
    for (let i = 0; i < 500; i++) lib = addBook(lib, { title: `Book number ${i}`, authors: ['Some Author'], status: 'read', rating: 4, remarks: 'x'.repeat(200) }).lib;
    const p = recommendationPrompt(lib, 'en', 3000);
    expect(p.length).toBeLessThan(3200);
    expect(p).toMatch(/and \d+ more/);
  });

  it('builds a "similar to" prompt', () => {
    const b = sample().books[0];
    expect(similarPrompt(b, 'en')).toContain('"Der Zauberberg" by Thomas Mann');
    expect(similarPrompt(b, 'de')).toContain('4.5/5');
  });
});
