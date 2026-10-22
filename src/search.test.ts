import { describe, expect, it } from 'vitest';
import { rankCatalog, type CatalogBook } from './catalog';
import { addBook, emptyLibrary, searchBooks, searchLibrary, type BookInput, type Library } from './library';
import { editDistance, norm, queryWords, rank, wordScore } from './search';

function lib(inputs: BookInput[]): Library {
  let l = emptyLibrary(['A'], 0);
  inputs.forEach((b, i) => (l = addBook(l, b, 1000 + i).lib));
  return l;
}

const L = lib([
  { title: 'Der Zauberberg', authors: ['Thomas Mann'], tags: ['signiert'] },
  { title: 'Buddenbrooks', authors: ['Thomas Mann'], series: 'Familie' },
  { title: 'Krieg und Frieden', authors: ['Lew Tolstoi'] },
  { title: 'Anna Karenina', authors: ['Lew Tolstoi'] },
  { title: 'Harry Potter and the Philosopher’s Stone', authors: ['J. K. Rowling'] },
  { title: 'The Remains of the Day', authors: ['Kazuo Ishiguro'] },
  { title: 'Never Let Me Go', authors: ['Kazuo Ishiguro'] },
  { title: 'Der Process', authors: ['Franz Kafka'], isbn: '9783596294336' }
]);
const titles = (q: string) => searchBooks(L.books, q).map((b) => b.title);

describe('basics', () => {
  it('normalizes text and drops filler words', () => {
    expect(norm('Größe, Ærø!')).toBe('grosse aero');
    expect(queryWords('The Remains of the Day')).toEqual(['remains', 'day']);
    expect(queryWords('the')).toEqual(['the']);
  });

  it('measures typos including swapped letters', () => {
    expect(editDistance('tolstoy', 'tolstoi')).toBe(1);
    expect(editDistance('zauberbreg', 'zauberberg')).toBe(1); // swap
    expect(editDistance('abc', 'xyzabc', 2)).toBe(3); // early exit
  });

  it('scores words', () => {
    const tok = ['der', 'zauberberg'];
    expect(wordScore('zauberberg', tok, 'der zauberberg')).toBe(1);
    expect(wordScore('zauber', tok, 'der zauberberg')).toBe(0.9);
    expect(wordScore('berg', tok, 'der zauberberg')).toBe(0.75);
    expect(wordScore('zauberbreg', tok, 'der zauberberg')).toBe(0.65);
    expect(wordScore('xyz', tok, 'der zauberberg')).toBe(0);
  });
});

describe('library search: title and author together', () => {
  it('finds title + author in any order', () => {
    expect(titles('zauberberg mann')).toEqual(['Der Zauberberg']);
    expect(titles('mann zauberberg')).toEqual(['Der Zauberberg']);
    expect(titles('Thomas Mann Buddenbrooks')).toEqual(['Buddenbrooks']);
    expect(titles('ishiguro remains')).toEqual(['The Remains of the Day']);
  });

  it('forgives typos and other spellings', () => {
    expect(titles('zauberbreg')).toEqual(['Der Zauberberg']);
    expect(titles('anna karenina tolstoy')).toEqual(['Anna Karenina']);
    expect(titles('ishiguru never')).toEqual(['Never Let Me Go']);
    expect(titles('Prozess Kafka')).toEqual(['Der Process']);
  });

  it('matches words while still typing', () => {
    expect(titles('harry pot')).toEqual(['Harry Potter and the Philosopher’s Stone']);
    expect(titles('krieg u frie')).toEqual(['Krieg und Frieden']);
  });

  it('matches words typed together', () => {
    expect(titles('harrypotter')).toEqual(['Harry Potter and the Philosopher’s Stone']);
  });

  it('ranks the best match first', () => {
    expect(titles('mann')).toHaveLength(2);
    expect(titles('tolstoi')[0]).toMatch(/Krieg|Anna/);
  });

  it('offers possible matches when not every word fits', () => {
    const r = searchLibrary(L.books, 'zauberberg rowling');
    expect(r.best).toEqual([]);
    expect(r.possible.map((b) => b.title)).toEqual(expect.arrayContaining(['Der Zauberberg', 'Harry Potter and the Philosopher’s Stone']));
    const r2 = searchLibrary(L.books, 'thomas mann zauberberg roman');
    expect(r2.best).toEqual([]);
    expect(r2.possible[0].title).toBe('Der Zauberberg');
  });

  it('still finds tags, series and ISBNs', () => {
    expect(titles('signiert')).toEqual(['Der Zauberberg']);
    expect(titles('familie mann')).toEqual(['Buddenbrooks']);
    expect(titles('978-3-596-29433-6')).toEqual(['Der Process']);
  });

  it('returns nothing for nonsense', () => {
    const r = searchLibrary(L.books, 'qqqq zzzz');
    expect(r.best).toEqual([]);
    expect(r.possible).toEqual([]);
  });
});

describe('catalog ranking', () => {
  const c = (title: string, author: string): CatalogBook => ({ title, authors: [author], subjects: [], source: 'google' });
  it('puts results matching title and author first', () => {
    const list = [c('Zauberberg – Lektürehilfe', 'Klett Verlag'), c('Thomas Mann: Eine Biographie', 'Hermann Kurzke'), c('Der Zauberberg', 'Thomas Mann')];
    const r = rankCatalog(list, 'zauberberg mann');
    expect(r.best.map((b) => b.title)).toEqual(['Der Zauberberg']);
    expect(r.possible).toHaveLength(2);
  });

  it('generic rank keeps order when asked', () => {
    const r = rank(['b a', 'a b'], 'a', (x) => [{ text: x, weight: 1 }], { keepOrder: true });
    expect(r.best).toEqual(['b a', 'a b']);
  });
});
