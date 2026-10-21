/**
 * Book catalogs: Google Books (good for German editions, full-text quote
 * search) and Open Library (good covers, subjects). Both are free and need
 * no API key. The parsers are pure; the network goes through an injected
 * `fetchJson` so everything can be tested with fixtures.
 */
import { normalizeText } from './library';

export interface CatalogBook {
  title: string;
  subtitle?: string;
  authors: string[];
  year?: number;
  pages?: number;
  publisher?: string;
  isbn?: string;
  language?: string;
  description?: string;
  subjects: string[];
  coverUrl?: string;
  infoUrl?: string;
  /** Open Library work key, e.g. "/works/OL123W", used to fetch a description. */
  olWorkKey?: string;
  /** Text around a quote match (Google full-text search). */
  snippet?: string;
  source: 'google' | 'openlibrary';
}

export type FetchJson = (url: string) => Promise<unknown>;

export class CatalogError extends Error {
  constructor(public kind: 'offline' | 'http' | 'timeout' | 'notfound', message: string = kind) {
    super(message);
  }
}

const GOOGLE = 'https://www.googleapis.com/books/v1/volumes';
const OL = 'https://openlibrary.org';
const OL_COVERS = 'https://covers.openlibrary.org/b';

/* ------------------------------------------------------------------ */
/* Small helpers                                                      */
/* ------------------------------------------------------------------ */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const s = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const n = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : []);

export function parseYear(v: unknown): number | undefined {
  if (typeof v === 'number') return v > 0 ? v : undefined;
  const m = typeof v === 'string' ? /(\d{4})/.exec(v) : null;
  return m ? Number(m[1]) : undefined;
}

const LANG3: Record<string, string> = { eng: 'en', ger: 'de', deu: 'de', fre: 'fr', fra: 'fr', spa: 'es', ita: 'it', pol: 'pl', vie: 'vi', hun: 'hu', dut: 'nl', nld: 'nl', por: 'pt', rus: 'ru', jpn: 'ja', chi: 'zh', zho: 'zh' };

const JUNK_SUBJECT = /accessible book|protected daisy|in library|large type|lending library|internet archive|^nyt:|open library|overdrive|staff picks|award|reading level|=|\(/i;

export function cleanSubjects(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    for (const part of raw.split(/\s*\/\s*|\s+--\s+/)) {
      const t = part.trim().replace(/\.$/, '');
      if (!t || t.length > 40 || JUNK_SUBJECT.test(t)) continue;
      const k = normalizeText(t);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
    if (out.length >= 8) break;
  }
  return out.slice(0, 8);
}

/** Google returns http:// thumbnails with a page-curl effect; fix both. */
export function googleCover(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
}

export const olCoverById = (id: number, size: 'S' | 'M' | 'L' = 'M') => `${OL_COVERS}/id/${id}-${size}.jpg`;

/** Larger version of a cover URL for the detail view (falls back to the same URL). */
export function largerCover(url: string): string {
  if (url.includes('covers.openlibrary.org')) return url.replace(/-[SM]\.jpg/, '-L.jpg');
  return url;
}

function stripHtml(t: string): string {
  return t
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ */
/* Parsers                                                            */
/* ------------------------------------------------------------------ */

export function parseGoogleVolume(item: unknown): CatalogBook | null {
  if (!isObj(item) || !isObj(item.volumeInfo)) return null;
  const v = item.volumeInfo;
  const title = s(v.title);
  if (!title) return null;
  const ids = Array.isArray(v.industryIdentifiers) ? v.industryIdentifiers.filter(isObj) : [];
  const isbn13 = s(ids.find((i) => i.type === 'ISBN_13')?.identifier);
  const isbn10 = s(ids.find((i) => i.type === 'ISBN_10')?.identifier);
  const images = isObj(v.imageLinks) ? v.imageLinks : {};
  const snippet = isObj(item.searchInfo) ? s(item.searchInfo.textSnippet) : undefined;
  const book: CatalogBook = {
    title,
    authors: strs(v.authors),
    subjects: cleanSubjects(strs(v.categories)),
    source: 'google'
  };
  const opt: Partial<CatalogBook> = {
    subtitle: s(v.subtitle),
    year: parseYear(v.publishedDate),
    pages: n(v.pageCount),
    publisher: s(v.publisher),
    isbn: isbn13 ?? (isbn10 ? toIsbn13(isbn10) : undefined),
    language: s(v.language),
    description: v.description ? stripHtml(String(v.description)) : undefined,
    coverUrl: googleCover(s(images.thumbnail) ?? s(images.smallThumbnail)),
    infoUrl: s(v.infoLink) ?? s(v.canonicalVolumeLink),
    snippet: snippet ? stripHtml(snippet) : undefined
  };
  return Object.assign(book, dropUndefined(opt));
}

export function parseGoogleResponse(json: unknown): CatalogBook[] {
  if (!isObj(json) || !Array.isArray(json.items)) return [];
  return json.items.map(parseGoogleVolume).filter((b): b is CatalogBook => !!b);
}

/** Open Library `api/books?bibkeys=ISBN:…&jscmd=data` response. */
export function parseOpenLibraryData(json: unknown, isbn: string): CatalogBook | null {
  if (!isObj(json)) return null;
  const d = json[`ISBN:${isbn}`];
  if (!isObj(d)) return null;
  const title = s(d.title);
  if (!title) return null;
  const authors = Array.isArray(d.authors) ? d.authors.filter(isObj).map((a) => s(a.name)).filter((x): x is string => !!x) : [];
  const subjects = Array.isArray(d.subjects) ? d.subjects.map((x) => (isObj(x) ? s(x.name) : s(x))).filter((x): x is string => !!x) : [];
  const publishers = Array.isArray(d.publishers) ? d.publishers.map((x) => (isObj(x) ? s(x.name) : s(x))).filter((x): x is string => !!x) : [];
  const cover = isObj(d.cover) ? s(d.cover.medium) ?? s(d.cover.large) ?? s(d.cover.small) : undefined;
  const book: CatalogBook = { title, authors, subjects: cleanSubjects(subjects), isbn, source: 'openlibrary' };
  return Object.assign(
    book,
    dropUndefined({
      subtitle: s(d.subtitle),
      year: parseYear(d.publish_date),
      pages: n(d.number_of_pages),
      publisher: publishers[0],
      coverUrl: cover,
      infoUrl: s(d.url)
    })
  );
}

/** Open Library `search.json` response. */
export function parseOpenLibrarySearch(json: unknown): CatalogBook[] {
  if (!isObj(json) || !Array.isArray(json.docs)) return [];
  const out: CatalogBook[] = [];
  for (const d of json.docs) {
    if (!isObj(d)) continue;
    const title = s(d.title);
    if (!title) continue;
    const isbns = strs(d.isbn);
    const isbn13 = isbns.find((x) => /^97[89]\d{10}$/.test(x)) ?? (isbns.find((x) => /^\d{9}[\dX]$/.test(x)) ? toIsbn13(isbns.find((x) => /^\d{9}[\dX]$/.test(x))!) : undefined);
    const langs = strs(d.language);
    const key = s(d.key);
    const book: CatalogBook = { title, authors: strs(d.author_name), subjects: cleanSubjects(strs(d.subject)), source: 'openlibrary' };
    out.push(
      Object.assign(
        book,
        dropUndefined({
          subtitle: s(d.subtitle),
          year: n(d.first_publish_year),
          pages: n(d.number_of_pages_median),
          isbn: isbn13,
          language: langs.length === 1 ? LANG3[langs[0]] : undefined,
          coverUrl: n(d.cover_i) ? olCoverById(d.cover_i as number) : undefined,
          infoUrl: key ? `${OL}${key}` : undefined,
          olWorkKey: key?.startsWith('/works/') ? key : undefined
        })
      )
    );
  }
  return out;
}

/** Open Library `subjects/<slug>.json` response. */
export function parseOpenLibrarySubject(json: unknown): CatalogBook[] {
  if (!isObj(json) || !Array.isArray(json.works)) return [];
  const out: CatalogBook[] = [];
  for (const w of json.works) {
    if (!isObj(w)) continue;
    const title = s(w.title);
    if (!title) continue;
    const key = s(w.key);
    const authors = Array.isArray(w.authors) ? w.authors.filter(isObj).map((a) => s(a.name)).filter((x): x is string => !!x) : [];
    out.push(
      Object.assign(
        { title, authors, subjects: cleanSubjects(strs(w.subject)), source: 'openlibrary' as const },
        dropUndefined({
          year: n(w.first_publish_year),
          coverUrl: n(w.cover_id) ? olCoverById(w.cover_id as number) : undefined,
          infoUrl: key ? `${OL}${key}` : undefined,
          olWorkKey: key?.startsWith('/works/') ? key : undefined
        })
      )
    );
  }
  return out;
}

/** Open Library work JSON → description and subjects. */
export function parseOpenLibraryWork(json: unknown): { description?: string; subjects: string[] } {
  if (!isObj(json)) return { subjects: [] };
  const d = json.description;
  const text = typeof d === 'string' ? d : isObj(d) ? s(d.value) : undefined;
  // descriptions often end with a "([source][1])" footer or markdown links; trim those
  const description = text
    ? text
        .replace(/\r/g, '')
        .split(/\n-{3,}\n|\n\[\d+\]:/)[0]
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim()
    : undefined;
  return { ...(description ? { description } : {}), subjects: cleanSubjects(strs(json.subjects)) };
}

/* ------------------------------------------------------------------ */
/* Merging and de-duplication                                         */
/* ------------------------------------------------------------------ */

function dropUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function toIsbn13(isbn10: string): string {
  const base = '978' + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 ? 3 : 1);
  return base + ((10 - (sum % 10)) % 10);
}

export function bookKey(b: { title: string; authors: string[] }): string {
  return `${normalizeText(b.title)}|${normalizeText(b.authors[0] ?? '').split(' ').pop() ?? ''}`;
}

/** Fill gaps in `a` with fields from `b`. */
export function mergeBooks(a: CatalogBook, b: CatalogBook, preferCoverFrom: 'a' | 'b' = 'a'): CatalogBook {
  const out: CatalogBook = { ...b, ...dropUndefined(a) } as CatalogBook;
  if (!a.authors.length) out.authors = b.authors;
  if (!a.subjects.length) out.subjects = b.subjects;
  if (preferCoverFrom === 'b' && b.coverUrl) out.coverUrl = b.coverUrl;
  if (!a.olWorkKey && b.olWorkKey) out.olWorkKey = b.olWorkKey;
  return out;
}

/** Remove duplicates (same ISBN or same title + author surname), merging their data. */
export function dedupeBooks(list: CatalogBook[]): CatalogBook[] {
  const out: CatalogBook[] = [];
  for (const b of list) {
    const i = out.findIndex((x) => (x.isbn && b.isbn && x.isbn === b.isbn) || bookKey(x) === bookKey(b));
    if (i < 0) out.push(b);
    else out[i] = mergeBooks(out[i], b);
  }
  return out;
}

/** Alternate between two result lists: a0, b0, a1, b1, … */
export function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

/** Shorten a quote to a phrase Google can match exactly. */
export function quoteQuery(text: string, maxWords = 12): string {
  const words = text
    .replace(/[„“”"«»‚‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

export function subjectSlug(subject: string): string {
  return subject
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/* ------------------------------------------------------------------ */
/* The catalog client                                                 */
/* ------------------------------------------------------------------ */

export class Catalog {
  constructor(private fetchJson: FetchJson) {}

  private async google(q: string, max = 20): Promise<CatalogBook[]> {
    const url = `${GOOGLE}?q=${encodeURIComponent(q)}&maxResults=${max}&printType=books`;
    return parseGoogleResponse(await this.fetchJson(url));
  }

  /** Run several sources; fail only if all of them failed. */
  private async settle<T>(tasks: Promise<T>[]): Promise<(T | undefined)[]> {
    const res = await Promise.allSettled(tasks);
    if (!res.some((r) => r.status === 'fulfilled')) throw (res[0] as PromiseRejectedResult).reason;
    return res.map((r) => (r.status === 'fulfilled' ? r.value : undefined));
  }

  /** Look up one ISBN in both catalogs and merge what they know. */
  async lookupIsbn(isbn: string): Promise<CatalogBook | null> {
    const [g, o] = await this.settle<CatalogBook | null>([
      this.google(`isbn:${isbn}`, 5).then((l) => l[0] ?? null),
      this.fetchJson(`${OL}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`).then((j) => parseOpenLibraryData(j, isbn))
    ]);
    let book: CatalogBook | null = null;
    if (g && o) book = mergeBooks(g, o, 'b');
    else book = g ?? o ?? null;
    if (book) book.isbn = isbn;
    return book;
  }

  /** Free-text search (title, author, keywords) in both catalogs. */
  async search(query: string): Promise<CatalogBook[]> {
    const q = query.trim();
    if (!q) return [];
    const fields = 'key,title,subtitle,author_name,first_publish_year,cover_i,isbn,number_of_pages_median,subject,language';
    const [g, o] = await this.settle<CatalogBook[]>([
      this.google(q),
      this.fetchJson(`${OL}/search.json?q=${encodeURIComponent(q)}&limit=15&fields=${fields}`).then(parseOpenLibrarySearch)
    ]);
    return dedupeBooks(interleave(g ?? [], o ?? []));
  }

  /** Find books containing a quote (Google Books full-text search). */
  async searchQuote(text: string): Promise<CatalogBook[]> {
    const phrase = quoteQuery(text);
    if (!phrase) return [];
    let res = await this.google(`"${phrase}"`);
    if (!res.length && phrase.split(' ').length > 5) res = await this.google(phrase);
    return dedupeBooks(res);
  }

  async byAuthor(author: string): Promise<CatalogBook[]> {
    const fields = 'key,title,subtitle,author_name,first_publish_year,cover_i,isbn,number_of_pages_median,subject,language';
    const [g, o] = await this.settle<CatalogBook[]>([
      this.google(`inauthor:"${author}"`),
      this.fetchJson(`${OL}/search.json?author=${encodeURIComponent(author)}&limit=20&sort=editions&fields=${fields}`).then(parseOpenLibrarySearch)
    ]);
    const surname = normalizeText(author).split(' ').pop() ?? '';
    return dedupeBooks(interleave(g ?? [], o ?? [])).filter((b) => b.authors.some((a) => normalizeText(a).includes(surname)));
  }

  async bySubject(subject: string): Promise<CatalogBook[]> {
    const [o, g] = await this.settle<CatalogBook[]>([
      this.fetchJson(`${OL}/subjects/${subjectSlug(subject)}.json?limit=20`).then(parseOpenLibrarySubject),
      this.google(`subject:"${subject}"`)
    ]);
    return dedupeBooks(interleave(o ?? [], g ?? []));
  }

  /** Fill in a description (and subjects) for a search result before showing it. */
  async details(b: CatalogBook): Promise<CatalogBook> {
    if (b.description || !b.olWorkKey) return b;
    try {
      const w = parseOpenLibraryWork(await this.fetchJson(`${OL}${b.olWorkKey}.json`));
      return { ...b, ...(w.description ? { description: w.description } : {}), subjects: b.subjects.length ? b.subjects : w.subjects };
    } catch {
      return b;
    }
  }
}

/** Default fetchJson for the browser: timeout + readable errors. */
export function browserFetchJson(timeoutMs = 12000): FetchJson {
  return async (url) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new CatalogError('offline');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.status === 404) throw new CatalogError('notfound');
      if (!res.ok) throw new CatalogError('http', `HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (e instanceof CatalogError) throw e;
      if ((e as Error).name === 'AbortError') throw new CatalogError('timeout');
      throw new CatalogError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'http', String(e));
    } finally {
      clearTimeout(timer);
    }
  };
}
