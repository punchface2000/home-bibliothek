import { describe, expect, it } from 'vitest';
import {
  Catalog,
  cleanSubjects,
  dedupeBooks,
  googleCover,
  interleave,
  largerCover,
  parseGoogleResponse,
  parseOpenLibraryData,
  parseOpenLibrarySearch,
  parseOpenLibrarySubject,
  parseOpenLibraryWork,
  parseYear,
  quoteQuery,
  subjectSlug,
  type CatalogBook
} from './catalog';

export const GOOGLE_FIXTURE = {
  kind: 'books#volumes',
  totalItems: 1,
  items: [
    {
      id: 'abc123',
      volumeInfo: {
        title: 'Der Zauberberg',
        subtitle: 'Roman',
        authors: ['Thomas Mann'],
        publisher: 'S. Fischer Verlag',
        publishedDate: '1991-05-01',
        description: 'Ein <b>großer</b> Roman &amp; mehr.<br>Zweite Zeile',
        industryIdentifiers: [
          { type: 'ISBN_10', identifier: '3596294339' },
          { type: 'ISBN_13', identifier: '9783596294336' }
        ],
        pageCount: 1008,
        categories: ['Fiction / Classics', 'Fiction / Literary'],
        imageLinks: {
          smallThumbnail: 'http://books.google.com/books/content?id=abc123&printsec=frontcover&img=1&zoom=5&edge=curl&source=gbs_api',
          thumbnail: 'http://books.google.com/books/content?id=abc123&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api'
        },
        language: 'de',
        infoLink: 'https://books.google.com/books?id=abc123'
      },
      searchInfo: { textSnippet: 'Die Zeit ist &quot;ein&quot; <b>Geheimnis</b>' }
    },
    { id: 'broken', volumeInfo: { authors: ['No title'] } }
  ]
};

export const OL_DATA_FIXTURE = {
  'ISBN:9783596294336': {
    url: 'https://openlibrary.org/books/OL1M/Der_Zauberberg',
    key: '/books/OL1M',
    title: 'Der Zauberberg',
    authors: [{ url: 'https://openlibrary.org/authors/OL1A', name: 'Thomas Mann' }],
    number_of_pages: 1010,
    publishers: [{ name: 'Fischer Taschenbuch' }],
    publish_date: '1991',
    subjects: [{ name: 'Accessible book', url: 'x' }, { name: 'Tuberculosis -- Patients -- Fiction', url: 'x' }, { name: 'Sanatoriums', url: 'x' }],
    cover: { small: 'https://covers.openlibrary.org/b/id/111-S.jpg', medium: 'https://covers.openlibrary.org/b/id/111-M.jpg', large: 'https://covers.openlibrary.org/b/id/111-L.jpg' }
  }
};

export const OL_SEARCH_FIXTURE = {
  numFound: 2,
  docs: [
    {
      key: '/works/OL1W',
      title: 'Der Zauberberg',
      author_name: ['Thomas Mann'],
      first_publish_year: 1924,
      cover_i: 111,
      isbn: ['3596294339', '9783596294336'],
      number_of_pages_median: 1000,
      subject: ['Fiction', 'In library', 'Davos'],
      language: ['ger']
    },
    { key: '/works/OL2W', title: 'Buddenbrooks', author_name: ['Thomas Mann'], first_publish_year: 1901, isbn: ['0679752609'], language: ['ger', 'eng'] }
  ]
};

describe('parsers', () => {
  it('parses Google Books volumes', () => {
    const [b, ...rest] = parseGoogleResponse(GOOGLE_FIXTURE);
    expect(rest).toHaveLength(0);
    expect(b).toMatchObject({
      title: 'Der Zauberberg',
      subtitle: 'Roman',
      authors: ['Thomas Mann'],
      year: 1991,
      pages: 1008,
      isbn: '9783596294336',
      language: 'de',
      publisher: 'S. Fischer Verlag',
      source: 'google'
    });
    expect(b.description).toBe('Ein großer Roman & mehr.\nZweite Zeile');
    expect(b.coverUrl).toBe('https://books.google.com/books/content?id=abc123&printsec=frontcover&img=1&zoom=1&source=gbs_api');
    expect(b.subjects).toEqual(['Fiction', 'Classics', 'Literary']);
    expect(b.snippet).toBe('Die Zeit ist "ein" Geheimnis');
    expect(parseGoogleResponse({ totalItems: 0 })).toEqual([]);
    expect(parseGoogleResponse('garbage')).toEqual([]);
  });

  it('parses Open Library ISBN data', () => {
    const b = parseOpenLibraryData(OL_DATA_FIXTURE, '9783596294336')!;
    expect(b).toMatchObject({ title: 'Der Zauberberg', authors: ['Thomas Mann'], year: 1991, pages: 1010, publisher: 'Fischer Taschenbuch' });
    expect(b.coverUrl).toBe('https://covers.openlibrary.org/b/id/111-M.jpg');
    expect(b.subjects).toEqual(['Tuberculosis', 'Patients', 'Fiction', 'Sanatoriums']);
    expect(parseOpenLibraryData({}, '9783596294336')).toBeNull();
  });

  it('parses Open Library search results', () => {
    const [a, b] = parseOpenLibrarySearch(OL_SEARCH_FIXTURE);
    expect(a).toMatchObject({ isbn: '9783596294336', year: 1924, language: 'de', olWorkKey: '/works/OL1W', coverUrl: 'https://covers.openlibrary.org/b/id/111-M.jpg' });
    expect(a.subjects).toEqual(['Fiction', 'Davos']);
    expect(b.isbn).toBe('9780679752608');
    expect(b.language).toBeUndefined();
    expect(b.coverUrl).toBeUndefined();
  });

  it('parses subjects and works', () => {
    const list = parseOpenLibrarySubject({ works: [{ key: '/works/OL9W', title: 'Stoner', authors: [{ name: 'John Williams' }], cover_id: 5, first_publish_year: 1965 }, { nope: 1 }] });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'Stoner', authors: ['John Williams'], year: 1965 });
    expect(parseOpenLibraryWork({ description: { type: '/type/text', value: 'A [novel](https://x) about time.\n----------\nSource' } }).description).toBe('A novel about time.');
    expect(parseOpenLibraryWork({ description: 'Plain' }).description).toBe('Plain');
    expect(parseOpenLibraryWork(null)).toEqual({ subjects: [] });
  });
});

describe('helpers', () => {
  it('parses years', () => {
    expect(parseYear('c1991')).toBe(1991);
    expect(parseYear('May 2004')).toBe(2004);
    expect(parseYear(undefined)).toBeUndefined();
  });

  it('cleans subjects', () => {
    expect(cleanSubjects(['Fiction / General', 'fiction', 'Protected DAISY', 'nyt:bestseller', 'x'.repeat(50)])).toEqual(['Fiction', 'General']);
  });

  it('fixes and enlarges covers', () => {
    expect(googleCover('http://a?b&edge=curl')).toBe('https://a?b');
    expect(largerCover('https://covers.openlibrary.org/b/id/1-M.jpg')).toBe('https://covers.openlibrary.org/b/id/1-L.jpg');
  });

  it('dedupes by ISBN and title+surname, merging fields', () => {
    const a: CatalogBook = { title: 'Stoner', authors: ['John Williams'], subjects: [], source: 'google', description: 'D' };
    const b: CatalogBook = { title: 'STONER', authors: ['J. Williams'], subjects: ['Campus'], source: 'openlibrary', coverUrl: 'c' };
    const out = dedupeBooks([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ description: 'D', coverUrl: 'c', subjects: ['Campus'], source: 'google' });
  });

  it('interleaves lists', () => {
    expect(interleave<number | string>([1, 2, 3], ['a'])).toEqual([1, 'a', 2, 3]);
  });

  it('builds quote queries and subject slugs', () => {
    expect(quoteQuery('„Es war einmal ein König, der hatte drei Töchter, die waren alle schön und klug“')).toBe('Es war einmal ein König, der hatte drei Töchter, die waren alle');
    expect(subjectSlug('Science Fiction & Fantasy')).toBe('science_fiction_fantasy');
    expect(subjectSlug('Märchen')).toBe('marchen');
  });
});

describe('Catalog client', () => {
  function fakeFetch(routes: Record<string, unknown>, log: string[] = []) {
    return async (url: string) => {
      log.push(url);
      for (const [part, body] of Object.entries(routes)) if (url.includes(part)) {
        if (body instanceof Error) throw body;
        return body;
      }
      return {};
    };
  }

  it('looks up an ISBN in both catalogs and prefers the Open Library cover', async () => {
    const c = new Catalog(fakeFetch({ 'googleapis.com': GOOGLE_FIXTURE, 'openlibrary.org/api/books': OL_DATA_FIXTURE }));
    const b = (await c.lookupIsbn('9783596294336'))!;
    expect(b.title).toBe('Der Zauberberg');
    expect(b.description).toContain('großer');
    expect(b.coverUrl).toBe('https://covers.openlibrary.org/b/id/111-M.jpg');
    expect(b.isbn).toBe('9783596294336');
  });

  it('still works when one catalog fails', async () => {
    const c = new Catalog(fakeFetch({ 'googleapis.com': new Error('down'), 'openlibrary.org/api/books': OL_DATA_FIXTURE }));
    expect((await c.lookupIsbn('9783596294336'))?.publisher).toBe('Fischer Taschenbuch');
  });

  it('throws when all catalogs fail', async () => {
    const c = new Catalog(fakeFetch({ 'googleapis.com': new Error('down'), 'openlibrary.org': new Error('down') }));
    await expect(c.search('x')).rejects.toThrow('down');
  });

  it('searches both catalogs and dedupes', async () => {
    const c = new Catalog(fakeFetch({ 'googleapis.com': GOOGLE_FIXTURE, 'search.json': OL_SEARCH_FIXTURE }));
    const res = await c.search('zauberberg');
    expect(res.map((b) => b.title)).toEqual(['Der Zauberberg', 'Buddenbrooks']);
    expect(res[0].olWorkKey).toBe('/works/OL1W');
    expect(await c.search('   ')).toEqual([]);
  });

  it('quote search uses an exact phrase and falls back to loose search', async () => {
    const log: string[] = [];
    const c = new Catalog(async (url) => {
      log.push(decodeURIComponent(url));
      return url.includes('%22') ? { totalItems: 0 } : GOOGLE_FIXTURE;
    });
    const res = await c.searchQuote('Die Zeit ist ein Geheimnis und nicht zu fassen');
    expect(res).toHaveLength(1);
    expect(log[0]).toContain('q="Die Zeit ist ein Geheimnis und nicht zu fassen"');
    expect(log[1]).not.toContain('"');
  });

  it('filters author results to that author', async () => {
    const c = new Catalog(fakeFetch({ 'googleapis.com': GOOGLE_FIXTURE, 'search.json': { docs: [{ title: 'Other', author_name: ['Someone Else'] }] } }));
    const res = await c.byAuthor('Thomas Mann');
    expect(res.map((b) => b.title)).toEqual(['Der Zauberberg']);
  });

  it('fetches a description from the work when missing', async () => {
    const c = new Catalog(fakeFetch({ '/works/OL1W.json': { description: 'From OL' } }));
    const b = await c.details({ title: 'X', authors: [], subjects: [], source: 'openlibrary', olWorkKey: '/works/OL1W' });
    expect(b.description).toBe('From OL');
  });
});
