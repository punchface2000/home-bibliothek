/**
 * Import reading history exported from Goodreads ("My Books → Import and
 * export → Export library") or StoryGraph ("Manage account → Export
 * StoryGraph library"). Pure functions, no DOM.
 */
import { parseFlexDate } from './dates';
import { normalizeIsbn } from './isbn';
import type { BookInput, Format, Status } from './library';

/** RFC 4180 CSV: quoted fields, "" escapes, line breaks inside quotes, BOM, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export type CsvSource = 'goodreads' | 'storygraph';

export interface ImportedBook extends BookInput {
  /** whether the file says the reader owns it (undefined = file doesn't say) */
  ownedInFile?: boolean;
}

export interface CsvImport {
  source: CsvSource;
  books: ImportedBook[];
  /** true if at least one book in the file is marked as owned */
  hasOwnership: boolean;
  skipped: number;
}

const clean = (v: string | undefined) => (v ?? '').trim();

/** Goodreads wraps ISBNs as ="0439023483" so spreadsheets keep the zeros. */
function isbnFrom(...values: (string | undefined)[]): string | undefined {
  for (const v of values) {
    const raw = clean(v).replace(/^="?|"$/g, '');
    if (!raw) continue;
    const n = normalizeIsbn(raw);
    if (n) return n;
  }
  return undefined;
}

/** "The Hunger Games (The Hunger Games, #1)" → title + series + number */
export function splitSeries(title: string): { title: string; series?: string; seriesNo?: number } {
  const m = /^(.*?)\s*\(([^()]+?),?\s*#\s*([\d.]+)(?:[-–]\d+)?\)\s*$/.exec(title.trim());
  if (!m) return { title: title.trim() };
  const no = Number(m[3]);
  return { title: m[1].trim() || title.trim(), series: m[2].trim(), seriesNo: Number.isFinite(no) ? no : undefined };
}

/** "2019/03/14", "2019-03-14", "03/14/2019"? → flexible date */
function dateFrom(v: string | undefined): string | undefined {
  const s = clean(v);
  if (!s) return undefined;
  const ymd = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(s);
  if (ymd) {
    const r = parseFlexDate(`${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`);
    return r || undefined;
  }
  const r = parseFlexDate(s);
  return r || undefined;
}

function formatFrom(v: string | undefined): Format | undefined {
  const s = clean(v).toLowerCase();
  if (!s) return undefined;
  if (/audio|hörbuch|audible/.test(s)) return 'audiobook';
  if (/kindle|ebook|e-book|digital|epub|nook/.test(s)) return 'ebook';
  if (/hardcover|hardback|gebunden/.test(s)) return 'hardcover';
  if (/paperback|taschenbuch|mass market|broschiert|softcover/.test(s)) return 'paperback';
  return undefined;
}

function ratingFrom(v: string | undefined): number | undefined {
  const n = parseFloat(clean(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.min(5, Math.round(n * 2) / 2) : undefined;
}

function intFrom(v: string | undefined): number | undefined {
  const n = parseInt(clean(v), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function splitList(v: string | undefined): string[] {
  return clean(v)
    .split(/\s*,\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const GOODREADS_SHELVES = new Set(['read', 'to-read', 'currently-reading', 'did-not-finish', 'dnf', 'owned', 'favorites-legacy']);

function readGoodreads(rows: Record<string, string>[]): ImportedBook[] {
  return rows.map((r) => {
    const { title, series, seriesNo } = splitSeries(clean(r['Title']));
    const exclusive = clean(r['Exclusive Shelf']).toLowerCase();
    const shelves = splitList(r['Bookshelves']).map((x) => x.toLowerCase());
    const status: Status =
      exclusive === 'read' ? 'read' : exclusive === 'currently-reading' ? 'reading' : /did-not-finish|dnf|abandon/.test(exclusive) || shelves.some((x) => /did-not-finish|dnf|abandon/.test(x)) ? 'abandoned' : 'toread';
    const authors = [clean(r['Author']), ...splitList(r['Additional Authors'])].filter(Boolean);
    const ownedRaw = parseInt(clean(r['Owned Copies']), 10);
    const owned = Number.isFinite(ownedRaw) ? ownedRaw : undefined;
    const review = clean(r['My Review']).replace(/<br\s*\/?>/gi, '\n');
    const notes = clean(r['Private Notes']);
    const tags = splitList(r['Bookshelves']).filter((x) => !GOODREADS_SHELVES.has(x.toLowerCase()) && x.toLowerCase() !== exclusive);
    const finished = status === 'read' ? dateFrom(r['Date Read']) : undefined;
    const year = intFrom(r['Original Publication Year']) ?? intFrom(r['Year Published']);
    return dropEmpty({
      title,
      series,
      seriesNo,
      authors,
      isbn: isbnFrom(r['ISBN13'], r['ISBN']),
      rating: ratingFrom(r['My Rating']),
      publisher: clean(r['Publisher']) || undefined,
      pages: intFrom(r['Number of Pages']),
      year,
      format: formatFrom(r['Binding']),
      status,
      finished,
      remarks: [review, notes].filter(Boolean).join('\n\n'),
      tags,
      ownedInFile: owned === undefined ? undefined : owned > 0
    });
  });
}

function readStoryGraph(rows: Record<string, string>[]): ImportedBook[] {
  return rows.map((r) => {
    const { title, series, seriesNo } = splitSeries(clean(r['Title']));
    const rs = clean(r['Read Status']).toLowerCase();
    const status: Status = rs === 'read' ? 'read' : rs === 'currently-reading' ? 'reading' : rs === 'did-not-finish' ? 'abandoned' : 'toread';
    // "Dates Read" can be "2023/01/05-2023/01/20"; "Last Date Read" is the finish date
    const range = clean(r['Dates Read']).split(/\s*[-–]\s*(?=\d{4}\/)/)[0];
    const owned = clean(r['Owned?']).toLowerCase();
    return dropEmpty({
      title,
      series,
      seriesNo,
      authors: splitList(r['Authors']),
      isbn: isbnFrom(r['ISBN/UID']),
      rating: ratingFrom(r['Star Rating']),
      format: formatFrom(r['Format']),
      status,
      started: status !== 'toread' ? dateFrom(range) : undefined,
      finished: status === 'read' ? dateFrom(r['Last Date Read']) : undefined,
      remarks: clean(r['Review']),
      tags: splitList(r['Tags']),
      ownedInFile: owned ? owned === 'yes' : undefined
    });
  });
}

function dropEmpty<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))) as T;
}

/** Recognise the file and turn it into books. Returns null if it's neither export. */
export function readReadingExport(text: string): CsvImport | null {
  const rows = parseCsv(text);
  if (rows.length < 1) return null;
  const head = rows[0].map((h) => h.trim());
  const objs = rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
  let source: CsvSource;
  let books: ImportedBook[];
  if (head.includes('Exclusive Shelf') && head.includes('Title')) {
    source = 'goodreads';
    books = readGoodreads(objs);
  } else if (head.includes('Read Status') && head.includes('Title')) {
    source = 'storygraph';
    books = readStoryGraph(objs);
  } else return null;
  const valid = books.filter((b) => b.title);
  return { source, books: valid, hasOwnership: valid.some((b) => b.ownedInFile === true), skipped: books.length - valid.length };
}
