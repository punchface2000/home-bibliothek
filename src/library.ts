/**
 * The library model: shelves and books, plus search, sorting, merging and
 * the "Ask Claude" prompt builders. Pure logic, no DOM, no storage.
 * Every update returns a new Library object.
 */
import { isFlexDate } from './dates';

export type Status = 'toread' | 'reading' | 'read' | 'abandoned';
export const STATUSES: Status[] = ['toread', 'reading', 'read', 'abandoned'];

export type Format = 'paperback' | 'hardcover' | 'ebook' | 'audiobook';
export const FORMATS: Format[] = ['paperback', 'hardcover', 'ebook', 'audiobook'];
/** ebooks and audiobooks don't stand on a wooden shelf */
export const isDigital = (b: Pick<Book, 'format'>): boolean => b.format === 'ebook' || b.format === 'audiobook';

export interface Quote {
  id: string;
  text: string;
  page?: string;
}

export interface Book {
  id: string;
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
  /** Link to the book's catalog page (Google Books / Open Library). */
  infoUrl?: string;
  shelfId: string;
  status: Status;
  owned: boolean;
  /** 0.5 … 5 in half steps; undefined = not rated */
  rating?: number;
  remarks: string;
  quotes: Quote[];
  /** YYYY, YYYY-MM or YYYY-MM-DD — as precise as the reader remembers */
  started?: string;
  finished?: string;
  /** CSS color for the spine, derived from the cover when possible */
  spineColor?: string;
  /** true if the reader picked the spine colour (don't overwrite it from the cover) */
  spineManual?: boolean;
  /** lent out to someone */
  lentTo?: string;
  lentSince?: string;
  /** reading progress for books being read */
  currentPage?: number;
  /** series name and number within it (1, 2, 2.5 …) */
  series?: string;
  seriesNo?: number;
  /** free labels across shelves: signed, gift, favourite … */
  tags: string[];
  format?: Format;
  /** position on the shelf when sorting by "My order" */
  order?: number;
  addedAt: number;
  updatedAt: number;
}

export interface Shelf {
  id: string;
  name: string;
  createdAt: number;
}

export interface Library {
  version: 1;
  shelves: Shelf[];
  books: Book[];
}

/** Everything about a book that can come from a catalog or a manual form. */
export type BookInput = Partial<Omit<Book, 'id' | 'addedAt' | 'updatedAt'>> & { title: string };

export function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* ------------------------------------------------------------------ */
/* Creating and sanitizing                                            */
/* ------------------------------------------------------------------ */

export function emptyLibrary(shelfNames: string[], now = Date.now()): Library {
  const names = shelfNames.length ? shelfNames : ['My books'];
  return { version: 1, shelves: names.map((name, i) => ({ id: newId(), name, createdAt: now + i })), books: [] };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Trimmed, de-duplicated (case-insensitive) labels. */
export function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of v) {
    if (typeof t !== 'string') continue;
    const tag = t.trim().replace(/\s+/g, ' ').slice(0, 40);
    const k = tag.toLowerCase();
    if (!tag || seen.has(k)) continue;
    seen.add(k);
    out.push(tag);
  }
  return out.slice(0, 20);
}

export function clampRating(r: unknown): number | undefined {
  const n = num(r);
  if (n === undefined || n <= 0) return undefined;
  return Math.min(5, Math.max(0.5, Math.round(n * 2) / 2));
}

/** Turn anything (old saved data, an imported file) into a valid Book, or null. */
export function sanitizeBook(raw: unknown, shelfIds: Set<string>, fallbackShelf: string, now = Date.now()): Book | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = str(r.title);
  if (!title) return null;
  const status = STATUSES.includes(r.status as Status) ? (r.status as Status) : 'toread';
  const shelfId = typeof r.shelfId === 'string' && shelfIds.has(r.shelfId) ? r.shelfId : fallbackShelf;
  const quotes: Quote[] = Array.isArray(r.quotes)
    ? r.quotes
        .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object' && !!str((q as Record<string, unknown>).text))
        .map((q) => ({ id: str(q.id) ?? newId(), text: String(q.text), ...(str(q.page) ? { page: String(q.page) } : {}) }))
    : [];
  const book: Book = {
    id: str(r.id) ?? newId(),
    title: title.trim(),
    authors: Array.isArray(r.authors) ? r.authors.filter((a): a is string => typeof a === 'string' && !!a.trim()) : [],
    subjects: Array.isArray(r.subjects) ? r.subjects.filter((a): a is string => typeof a === 'string' && !!a.trim()).slice(0, 12) : [],
    shelfId,
    status,
    owned: typeof r.owned === 'boolean' ? r.owned : true,
    remarks: typeof r.remarks === 'string' ? r.remarks : '',
    quotes,
    tags: cleanTags(r.tags),
    addedAt: num(r.addedAt) ?? now,
    updatedAt: num(r.updatedAt) ?? num(r.addedAt) ?? now
  };
  const opt: Partial<Book> = {
    subtitle: str(r.subtitle),
    year: num(r.year),
    pages: num(r.pages),
    publisher: str(r.publisher),
    isbn: str(r.isbn),
    language: str(r.language),
    description: str(r.description),
    coverUrl: str(r.coverUrl),
    infoUrl: str(r.infoUrl),
    rating: clampRating(r.rating),
    started: isFlexDate(r.started) ? r.started : undefined,
    finished: isFlexDate(r.finished) ? r.finished : undefined,
    spineColor: str(r.spineColor),
    spineManual: r.spineManual === true && !!str(r.spineColor) ? true : undefined,
    lentTo: str(r.lentTo)?.trim(),
    lentSince: str(r.lentTo) && isFlexDate(r.lentSince) ? r.lentSince : undefined,
    currentPage: num(r.currentPage) !== undefined && (r.currentPage as number) > 0 ? Math.round(r.currentPage as number) : undefined,
    series: str(r.series)?.trim(),
    seriesNo: str(r.series) && num(r.seriesNo) !== undefined && (r.seriesNo as number) >= 0 ? (r.seriesNo as number) : undefined,
    format: FORMATS.includes(r.format as Format) ? (r.format as Format) : undefined,
    order: num(r.order)
  };
  for (const [k, v] of Object.entries(opt)) if (v !== undefined) (book as unknown as Record<string, unknown>)[k] = v;
  return book;
}

/** Make sure saved or imported data is a usable library. Never throws. */
export function sanitizeLibrary(raw: unknown, defaultShelfNames: string[], now = Date.now()): Library {
  if (!raw || typeof raw !== 'object') return emptyLibrary(defaultShelfNames, now);
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const shelves: Shelf[] = Array.isArray(r.shelves)
    ? r.shelves
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map((s) => ({ id: str(s.id) ?? newId(), name: (str(s.name) ?? 'Shelf').trim(), createdAt: num(s.createdAt) ?? now }))
        .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
    : [];
  if (!shelves.length) shelves.push(...emptyLibrary(defaultShelfNames.slice(0, 1), now).shelves);
  const ids = new Set(shelves.map((s) => s.id));
  const seenBooks = new Set<string>();
  const books = (Array.isArray(r.books) ? r.books : [])
    .map((b) => sanitizeBook(b, ids, shelves[0].id, now))
    .filter((b): b is Book => !!b && (seenBooks.has(b.id) ? false : (seenBooks.add(b.id), true)));
  return { version: 1, shelves, books };
}

/* ------------------------------------------------------------------ */
/* Shelves                                                            */
/* ------------------------------------------------------------------ */

export function addShelf(lib: Library, name: string, now = Date.now()): { lib: Library; shelf: Shelf } {
  const shelf: Shelf = { id: newId(), name: name.trim() || 'Shelf', createdAt: now };
  return { lib: { ...lib, shelves: [...lib.shelves, shelf] }, shelf };
}

export function renameShelf(lib: Library, id: string, name: string): Library {
  const n = name.trim();
  if (!n) return lib;
  return { ...lib, shelves: lib.shelves.map((s) => (s.id === id ? { ...s, name: n } : s)) };
}

/** Move a shelf one step left (-1) or right (+1) in the library. */
export function moveShelf(lib: Library, id: string, dir: -1 | 1): Library {
  const i = lib.shelves.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= lib.shelves.length) return lib;
  const shelves = [...lib.shelves];
  [shelves[i], shelves[j]] = [shelves[j], shelves[i]];
  return { ...lib, shelves };
}

/** Delete a shelf; its books move to `moveTo` (or the first other shelf). The last shelf can't be deleted. */
export function deleteShelf(lib: Library, id: string, moveTo?: string, now = Date.now()): Library {
  if (lib.shelves.length <= 1 || !lib.shelves.some((s) => s.id === id)) return lib;
  const shelves = lib.shelves.filter((s) => s.id !== id);
  const target = shelves.some((s) => s.id === moveTo) ? moveTo! : shelves[0].id;
  return {
    ...lib,
    shelves,
    books: lib.books.map((b) => (b.shelfId === id ? { ...b, shelfId: target, updatedAt: now } : b))
  };
}

/* ------------------------------------------------------------------ */
/* Books                                                              */
/* ------------------------------------------------------------------ */

export function addBook(lib: Library, input: BookInput, now = Date.now()): { lib: Library; book: Book } {
  const ids = new Set(lib.shelves.map((s) => s.id));
  const book = sanitizeBook({ ...input, id: newId(), addedAt: now, updatedAt: now }, ids, lib.shelves[0].id, now)!;
  return { lib: { ...lib, books: [...lib.books, book] }, book };
}

export function updateBook(lib: Library, id: string, patch: Partial<Omit<Book, 'id'>>, now = Date.now()): Library {
  const ids = new Set(lib.shelves.map((s) => s.id));
  return {
    ...lib,
    books: lib.books.map((b) => {
      if (b.id !== id) return b;
      const merged: Record<string, unknown> = { ...b, ...patch, id: b.id, updatedAt: now };
      // allow clearing optional fields by passing undefined
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete merged[k];
      return sanitizeBook(merged, ids, b.shelfId, now) ?? b;
    })
  };
}

export function removeBook(lib: Library, id: string): Library {
  return { ...lib, books: lib.books.filter((b) => b.id !== id) };
}

export function addQuote(lib: Library, bookId: string, text: string, page?: string, now = Date.now()): Library {
  const b = lib.books.find((x) => x.id === bookId);
  if (!b || !text.trim()) return lib;
  const q: Quote = { id: newId(), text: text.trim(), ...(page?.trim() ? { page: page.trim() } : {}) };
  return updateBook(lib, bookId, { quotes: [...b.quotes, q] }, now);
}

export function removeQuote(lib: Library, bookId: string, quoteId: string, now = Date.now()): Library {
  const b = lib.books.find((x) => x.id === bookId);
  if (!b) return lib;
  return updateBook(lib, bookId, { quotes: b.quotes.filter((q) => q.id !== quoteId) }, now);
}

/** Lowercase, strip accents, ß → ss, collapse spaces. Used for matching. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Same book already in the library? Matches on ISBN, else on title + first author. */
export function findDuplicate(lib: Library, cand: { isbn?: string; title: string; authors?: string[] }): Book | undefined {
  if (cand.isbn) {
    const hit = lib.books.find((b) => b.isbn && b.isbn === cand.isbn);
    if (hit) return hit;
  }
  const t = normalizeText(cand.title);
  const a = normalizeText(cand.authors?.[0] ?? '');
  return lib.books.find((b) => normalizeText(b.title) === t && normalizeText(b.authors[0] ?? '') === a);
}

/* ------------------------------------------------------------------ */
/* Sorting, searching, counting                                       */
/* ------------------------------------------------------------------ */

export type SortKey = 'author' | 'title' | 'added' | 'rating' | 'manual';
export const SORT_KEYS: SortKey[] = ['author', 'title', 'added', 'rating', 'manual'];

/** "Thomas Mann" → "mann thomas", "Mann, Thomas" → "mann thomas". */
export function authorSortKey(name: string | undefined): string {
  if (!name) return '￿';
  const n = name.trim();
  if (n.includes(',')) return normalizeText(n);
  const parts = n.split(/\s+/);
  const last = parts.pop()!;
  return normalizeText([last, ...parts].join(' '));
}

/** Titles sort without leading articles ("The", "Der", "Die", "Das", …). */
export function titleSortKey(title: string): string {
  return normalizeText(title).replace(/^(the|a|an|der|die|das|ein|eine) /, '');
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/** Within one author: series first (grouped by series name), then standalone books by year. */
function seriesKey(b: Book, year: number | undefined): string {
  return b.series ? `0 ${normalizeText(b.series)}` : `1 ${String(year ?? 0).padStart(4, '0')}`;
}

export function sortBooks(books: Book[], key: SortKey): Book[] {
  const byTitle = (a: Book, b: Book) => collator.compare(titleSortKey(a.title), titleSortKey(b.title));
  const cmp: Record<SortKey, (a: Book, b: Book) => number> = {
    // same author: books of a series stay together and in order, then the rest by year
    author: (a, b) =>
      collator.compare(authorSortKey(a.authors[0]), authorSortKey(b.authors[0])) ||
      collator.compare(seriesKey(a, a.year), seriesKey(b, b.year)) ||
      (a.seriesNo ?? 0) - (b.seriesNo ?? 0) ||
      (a.year ?? 0) - (b.year ?? 0) ||
      byTitle(a, b),
    title: byTitle,
    added: (a, b) => b.addedAt - a.addedAt,
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byTitle(a, b),
    manual: (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.addedAt - b.addedAt
  };
  return [...books].sort(cmp[key]);
}

export interface BookFilter {
  status?: Status;
  shelfId?: string;
  owned?: boolean;
  lent?: boolean;
  tag?: string;
  series?: string;
}

export function filterBooks(books: Book[], f: BookFilter): Book[] {
  const tag = f.tag?.toLowerCase();
  const series = f.series ? normalizeText(f.series) : undefined;
  return books.filter(
    (b) =>
      (f.status === undefined || b.status === f.status) &&
      (f.shelfId === undefined || b.shelfId === f.shelfId) &&
      (f.owned === undefined || b.owned === f.owned) &&
      (f.lent === undefined || !!b.lentTo === f.lent) &&
      (tag === undefined || b.tags.some((x) => x.toLowerCase() === tag)) &&
      (series === undefined || (!!b.series && normalizeText(b.series) === series))
  );
}

/**
 * Search the library. Every word of the query must appear somewhere
 * (title, author, ISBN, subjects, remarks, quotes, publisher).
 * Title and author hits rank higher.
 */
export function searchBooks(books: Book[], query: string): Book[] {
  const words = normalizeText(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const digits = query.replace(/[\s-]/g, '');
  const scored: { b: Book; s: number }[] = [];
  for (const b of books) {
    const title = normalizeText(`${b.title} ${b.subtitle ?? ''}`);
    const authors = normalizeText(b.authors.join(' '));
    const rest = normalizeText([b.isbn ?? '', b.publisher ?? '', b.series ?? '', b.lentTo ?? '', b.tags.join(' '), b.subjects.join(' '), b.remarks, b.quotes.map((q) => q.text).join(' ')].join(' '));
    let score = 0;
    let all = true;
    for (const w of words) {
      if (title.startsWith(w)) score += 6;
      else if (title.split(' ').some((t) => t.startsWith(w))) score += 4;
      else if (title.includes(w)) score += 3;
      else if (authors.split(' ').some((t) => t.startsWith(w))) score += 4;
      else if (authors.includes(w)) score += 2;
      else if (rest.includes(w)) score += 1;
      else {
        all = false;
        break;
      }
    }
    if (!all && /^\d{10,13}$/.test(digits) && b.isbn === digits) (all = true), (score = 10);
    if (all) scored.push({ b, s: score });
  }
  return scored.sort((x, y) => y.s - x.s || collator.compare(x.b.title, y.b.title)).map((x) => x.b);
}

export type Counts = Record<Status, number> & { total: number; wishlist: number; lent: number };

export function countBooks(books: Book[]): Counts {
  const c: Counts = { toread: 0, reading: 0, read: 0, abandoned: 0, total: books.length, wishlist: 0, lent: 0 };
  for (const b of books) {
    c[b.status]++;
    if (!b.owned) c.wishlist++;
    if (b.lentTo) c.lent++;
  }
  return c;
}

/* ------------------------------------------------------------------ */
/* Several books at once                                              */
/* ------------------------------------------------------------------ */

export function moveBooks(lib: Library, ids: Iterable<string>, shelfId: string, now = Date.now()): Library {
  if (!lib.shelves.some((s) => s.id === shelfId)) return lib;
  const set = new Set(ids);
  return { ...lib, books: lib.books.map((b) => (set.has(b.id) && b.shelfId !== shelfId ? { ...b, shelfId, order: undefined, updatedAt: now } : b)) };
}

export function removeBooks(lib: Library, ids: Iterable<string>): Library {
  const set = new Set(ids);
  return { ...lib, books: lib.books.filter((b) => !set.has(b.id)) };
}

/** Save "My order" for a shelf: the books get positions 0, 1, 2 … in the given order. */
export function setShelfOrder(lib: Library, orderedIds: string[], now = Date.now()): Library {
  const pos = new Map(orderedIds.map((id, i) => [id, i]));
  return { ...lib, books: lib.books.map((b) => (pos.has(b.id) && b.order !== pos.get(b.id) ? { ...b, order: pos.get(b.id), updatedAt: now } : b)) };
}

/** Move `id` so it sits before `beforeId` (or at the end if beforeId is null) in a list of ids. */
export function reorderIds(ids: string[], id: string, beforeId: string | null): string[] {
  const rest = ids.filter((x) => x !== id);
  const i = beforeId === null ? rest.length : rest.indexOf(beforeId);
  rest.splice(i < 0 ? rest.length : i, 0, id);
  return rest;
}

/* ------------------------------------------------------------------ */
/* Tags and series                                                    */
/* ------------------------------------------------------------------ */

/** All tags in use, most used first. */
export function allTags(books: Book[]): { tag: string; count: number }[] {
  const m = new Map<string, { tag: string; count: number }>();
  for (const b of books)
    for (const t of b.tags) {
      const k = t.toLowerCase();
      const e = m.get(k) ?? { tag: t, count: 0 };
      e.count++;
      m.set(k, e);
    }
  return [...m.values()].sort((a, b) => b.count - a.count || collator.compare(a.tag, b.tag));
}

/** Books of a series in reading order. */
export function seriesBooks(books: Book[], series: string): Book[] {
  return filterBooks(books, { series }).sort((a, b) => (a.seriesNo ?? 1e9) - (b.seriesNo ?? 1e9) || (a.year ?? 0) - (b.year ?? 0));
}

/**
 * The next volume after `b`: the library book with the next number if there is
 * one, otherwise just the number that's missing (so the app can offer a search).
 */
export function nextInSeries(books: Book[], b: Book): { book?: Book; no: number } | null {
  if (!b.series || b.seriesNo === undefined) return null;
  const later = seriesBooks(books, b.series).filter((x) => x.seriesNo !== undefined && x.seriesNo > b.seriesNo!);
  const wanted = Math.floor(b.seriesNo) + 1;
  const exact = later.find((x) => x.seriesNo === wanted);
  return exact ? { book: exact, no: wanted } : { no: wanted };
}

/** Existing series names (for suggestions while typing). */
export function allSeries(books: Book[]): string[] {
  const m = new Map<string, string>();
  for (const b of books) if (b.series) m.set(normalizeText(b.series), b.series);
  return [...m.values()].sort(collator.compare);
}

/* ------------------------------------------------------------------ */
/* Pick something to read                                             */
/* ------------------------------------------------------------------ */

/** Books worth suggesting: owned to-read books first; if there are none, the wishlist. */
export function readNextPool(books: Book[]): Book[] {
  const toread = books.filter((b) => b.status === 'toread');
  const owned = toread.filter((b) => b.owned && !b.lentTo);
  return owned.length ? owned : toread;
}

/** A random pick from the pool, never the same book twice in a row if there's a choice. */
export function pickRandom<T extends { id: string }>(pool: T[], random: () => number = Math.random, avoidId?: string): T | undefined {
  if (!pool.length) return undefined;
  const choices = pool.length > 1 && avoidId ? pool.filter((b) => b.id !== avoidId) : pool;
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}

/* ------------------------------------------------------------------ */
/* Sharing the wishlist                                               */
/* ------------------------------------------------------------------ */

export function wishlistText(books: Book[], lang: Lang): string {
  const wish = sortBooks(books.filter((b) => !b.owned), 'author');
  const head = lang === 'de' ? 'Meine Bücher-Wunschliste' : 'My book wishlist';
  if (!wish.length) return head;
  const lines = wish.map((b) => `• ${b.title}${b.authors.length ? ` — ${b.authors.join(', ')}` : ''}${b.isbn ? ` (ISBN ${b.isbn})` : ''}`);
  return `${head}\n\n${lines.join('\n')}`;
}

/* ------------------------------------------------------------------ */
/* Backup merge                                                       */
/* ------------------------------------------------------------------ */

/**
 * Merge an imported library into the current one. Shelves and books are
 * matched by id; for books present in both, the more recently updated
 * version wins. Nothing is deleted.
 */
export function mergeLibraries(current: Library, incoming: Library): { lib: Library; added: number; updated: number } {
  const shelves = [...current.shelves];
  const shelfIds = new Set(shelves.map((s) => s.id));
  for (const s of incoming.shelves) if (!shelfIds.has(s.id)) shelves.push(s), shelfIds.add(s.id);
  const byId = new Map(current.books.map((b) => [b.id, b]));
  let added = 0;
  let updated = 0;
  for (const b of incoming.books) {
    const mine = byId.get(b.id);
    if (!mine) {
      byId.set(b.id, { ...b, shelfId: shelfIds.has(b.shelfId) ? b.shelfId : shelves[0].id });
      added++;
    } else if (b.updatedAt > mine.updatedAt) {
      byId.set(b.id, { ...b, shelfId: shelfIds.has(b.shelfId) ? b.shelfId : mine.shelfId });
      updated++;
    }
  }
  return { lib: { version: 1, shelves, books: [...byId.values()] }, added, updated };
}

/* ------------------------------------------------------------------ */
/* Rating input                                                       */
/* ------------------------------------------------------------------ */

/** Map a tap at x (px) on a row of `stars` stars `width` px wide to a half-step rating. */
export function ratingFromX(x: number, width: number, stars = 5): number {
  if (width <= 0) return 0.5;
  const v = Math.ceil((Math.min(Math.max(x, 0), width) / width) * stars * 2) / 2;
  return Math.min(stars, Math.max(0.5, v));
}

/* ------------------------------------------------------------------ */
/* "Ask Claude" prompts (copied to the clipboard; no API involved)    */
/* ------------------------------------------------------------------ */

export type Lang = 'en' | 'de';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

function bookLine(b: Book): string {
  let line = `- ${b.title}${b.authors.length ? ` — ${b.authors.join(', ')}` : ''}`;
  if (b.rating) line += ` (${b.rating}/5)`;
  if (b.remarks.trim()) line += ` — "${clip(oneLine(b.remarks), 140)}"`;
  return line;
}

const PROMPT_TEXT = {
  en: {
    intro: 'Here is my personal library. Please recommend 5 books I don\'t have yet that fit my taste. For each one give the title, the author, and one or two sentences on why I\'d like it, referring to books from my list. Prefer books that are available in English or German.',
    read: 'Read (my rating out of 5, my notes):',
    reading: 'Currently reading:',
    toread: 'On my to-read list:',
    abandoned: 'Started but abandoned:',
    more: (n: number) => `…and ${n} more`,
    empty: 'My library is still empty. Ask me a few questions about what I like first.',
    similar: (b: Book) =>
      `I'd like book recommendations similar to "${b.title}"${b.authors.length ? ` by ${b.authors.join(', ')}` : ''}.` +
      (b.rating ? ` I rated it ${b.rating}/5.` : '') +
      (b.remarks.trim() ? ` My notes on it: "${clip(oneLine(b.remarks), 400)}"` : '') +
      ' Please suggest 5 books, each with title, author and one or two sentences on what makes it similar. Prefer books available in English or German.'
  },
  de: {
    intro: 'Hier ist meine private Bibliothek. Bitte empfiehl mir 5 Bücher, die ich noch nicht habe und die zu meinem Geschmack passen. Nenne jeweils Titel, Autor und in ein bis zwei Sätzen, warum mir das Buch gefallen könnte – mit Bezug auf Bücher aus meiner Liste. Bevorzugt Bücher, die es auf Deutsch oder Englisch gibt.',
    read: 'Gelesen (meine Bewertung von 5, meine Notizen):',
    reading: 'Lese ich gerade:',
    toread: 'Will ich noch lesen:',
    abandoned: 'Angefangen, aber abgebrochen:',
    more: (n: number) => `…und ${n} weitere`,
    empty: 'Meine Bibliothek ist noch leer. Stell mir zuerst ein paar Fragen dazu, was ich gerne lese.',
    similar: (b: Book) =>
      `Ich hätte gern Buchempfehlungen ähnlich wie „${b.title}"${b.authors.length ? ` von ${b.authors.join(', ')}` : ''}.` +
      (b.rating ? ` Ich habe es mit ${b.rating}/5 bewertet.` : '') +
      (b.remarks.trim() ? ` Meine Notizen dazu: „${clip(oneLine(b.remarks), 400)}"` : '') +
      ' Bitte schlag mir 5 Bücher vor, jeweils mit Titel, Autor und ein bis zwei Sätzen, was sie ähnlich macht. Bevorzugt Bücher, die es auf Deutsch oder Englisch gibt.'
  }
} as const;

/** A prompt describing the whole library, for recommendations. Kept under ~maxChars. */
export function recommendationPrompt(lib: Library, lang: Lang, maxChars = 6000): string {
  const T = PROMPT_TEXT[lang];
  if (!lib.books.length) return T.empty;
  const groups: [string, Book[]][] = [
    [T.read, sortBooks(lib.books.filter((b) => b.status === 'read'), 'rating')],
    [T.reading, lib.books.filter((b) => b.status === 'reading')],
    [T.toread, sortBooks(lib.books.filter((b) => b.status === 'toread'), 'added')],
    [T.abandoned, lib.books.filter((b) => b.status === 'abandoned')]
  ];
  // share the budget: each group gets lines until the total runs out
  let budget = maxChars - T.intro.length - 20;
  const parts: string[] = [T.intro];
  for (const [head, books] of groups) {
    if (!books.length) continue;
    const lines: string[] = [];
    let i = 0;
    for (; i < books.length; i++) {
      const l = bookLine(books[i]);
      if (budget - l.length - 1 < 0) break;
      lines.push(l);
      budget -= l.length + 1;
    }
    if (!lines.length) continue;
    if (i < books.length) lines.push(T.more(books.length - i));
    parts.push(`${head}\n${lines.join('\n')}`);
    budget -= head.length + 2;
  }
  return parts.join('\n\n');
}

export function similarPrompt(b: Book, lang: Lang): string {
  return PROMPT_TEXT[lang].similar(b);
}
