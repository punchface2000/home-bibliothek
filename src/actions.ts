/** Actions used from several views: adding books, spine colors, backup, Ask Claude. */
import { catalog, commit, lib, settings, t, updateSettings } from './app';
import type { CatalogBook } from './catalog';
import { colorFromCover } from './covers';
import { addBook, mergeLibraries, updateBook, type Book, type BookInput, type Library, type Status } from './library';
import { backupFileName, backupJson, parseBackup } from './storage';
import { toast } from './ui/overlay';

export interface Placement {
  shelfId: string;
  status: Status;
  owned: boolean;
  /** optional reading dates (YYYY, YYYY-MM or YYYY-MM-DD) */
  started?: string;
  finished?: string;
}

/** Catalog result → library book (keeps only fields we store). */
export function toBookInput(c: CatalogBook): BookInput {
  const { snippet: _s, olWorkKey: _k, source: _src, ...rest } = c;
  return rest;
}

/** Add a book. `rerender: false` keeps the current screen as it is (batch scanning). */
export function addToLibrary(input: BookInput, place: Placement, rerender = true): Book {
  // dates are only what the reader entered; nothing is filled in automatically
  const dates: Partial<Book> = {};
  if (place.started && place.status !== 'toread') dates.started = place.started;
  if (place.finished && place.status === 'read') dates.finished = place.finished;
  const { lib: next, book } = addBook(lib, { ...input, ...dates, shelfId: place.shelfId, status: place.status, owned: place.owned });
  commit(next, rerender);
  updateSettings({ lastShelfId: place.shelfId, lastStatus: place.status, lastOwned: place.owned }, false);
  requestPersistentStorage();
  if (book.coverUrl) void fillSpineColor(book.id, book.coverUrl);
  return book;
}

async function fillSpineColor(id: string, url: string): Promise<void> {
  const c = await colorFromCover(url);
  if (!c) return;
  const b = lib.books.find((x) => x.id === id);
  if (!b || b.coverUrl !== url || b.spineManual) return;
  commit(updateBook(lib, id, { spineColor: c }, b.updatedAt), false);
  document.querySelectorAll<HTMLElement>(`[data-book="${CSS.escape(id)}"]`).forEach((el) => el.style.setProperty('--spine', c));
}

/** In the background, try to get spine colors for books that have a cover but no color yet. */
export async function backfillSpineColors(): Promise<void> {
  if (!navigator.onLine) return;
  const todo = lib.books.filter((b) => b.coverUrl && !b.spineColor && !b.spineManual).slice(0, 40);
  for (const b of todo) await fillSpineColor(b.id, b.coverUrl!);
}

/** Changing the cover (e.g. in "Edit details") should recompute the color. */
export function coverChanged(id: string, url: string | undefined): void {
  const b = lib.books.find((x) => x.id === id);
  if (!b || b.spineManual) return;
  commit(updateBook(lib, id, { spineColor: undefined }, b.updatedAt), false);
  if (url) void fillSpineColor(id, url);
}

let persistAsked = false;
function requestPersistentStorage(): void {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Backup                                                             */
/* ------------------------------------------------------------------ */

export async function exportBackup(): Promise<void> {
  const text = backupJson(lib);
  const name = backupFileName();
  const file = new File([text], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  // On iPhone the share sheet lets you "Save to Files"; elsewhere download the file.
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [file], title: name });
      updateSettings({ lastBackup: Date.now() });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  updateSettings({ lastBackup: Date.now() });
}

export async function importBackupFile(file: File): Promise<void> {
  const text = await file.text();
  const incoming = parseBackup(text, [t.defaultShelf]);
  if (!incoming) {
    toast(t.importFailed);
    return;
  }
  const r = mergeLibraries(lib, incoming);
  commit(r.lib);
  toast(t.imported(r.added, r.updated));
  void backfillSpineColors();
}

/* ------------------------------------------------------------------ */
/* Ask Claude: copy a prompt and open claude.ai (no API, no cost)     */
/* ------------------------------------------------------------------ */

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Copy the prompt, then open Claude with the prompt pre-filled where supported. */
export function copyAndOpenClaude(prompt: string): void {
  // window.open must run synchronously in the tap handler (Safari blocks it otherwise)
  const copying = copyText(prompt);
  const url = prompt.length < 6000 ? `https://claude.ai/new?q=${encodeURIComponent(prompt)}` : 'https://claude.ai/new';
  window.open(url, '_blank', 'noopener');
  void copying.then((ok) => toast(ok ? t.copied : t.copyFailed));
}


/* ------------------------------------------------------------------ */
/* Undo                                                               */
/* ------------------------------------------------------------------ */

/** Show a message with an "Undo" button that puts the library back as it was. */
export function offerUndo(message: string, before: Library, after?: () => void): void {
  toast(message, {
    label: t.undo,
    run: () => {
      commit(before);
      after?.();
    }
  }, 4500);
}

/* ------------------------------------------------------------------ */
/* Spine colour picked by hand                                        */
/* ------------------------------------------------------------------ */

export function setSpineColour(id: string, colour: string | null): void {
  const b = lib.books.find((x) => x.id === id);
  if (!b) return;
  if (colour) commit(updateBook(lib, id, { spineColor: colour, spineManual: true }), false);
  else {
    // back to automatic: forget the colour and read it from the cover again
    commit(updateBook(lib, id, { spineColor: undefined, spineManual: undefined }), false);
    if (b.coverUrl) void fillSpineColor(id, b.coverUrl);
  }
}

/* ------------------------------------------------------------------ */
/* Filling in details for imported / hand-entered books               */
/* ------------------------------------------------------------------ */

const enriched = new Set<string>();

/**
 * Books from an import only have the basics. When such a book is opened and
 * we're online, look its ISBN up once and fill in whatever is missing
 * (cover, description, subjects, language, pages, publisher). Never
 * overwrites what's already there.
 */
export async function enrichBook(id: string, onDone: () => void): Promise<void> {
  const b = lib.books.find((x) => x.id === id);
  if (!b || !b.isbn || enriched.has(id) || !navigator.onLine) return;
  if (b.description && b.coverUrl && b.subjects.length && b.language) return;
  enriched.add(id);
  try {
    const c = await catalog.lookupIsbn(b.isbn);
    const now = lib.books.find((x) => x.id === id);
    if (!c || !now) return;
    const p: Partial<Book> = {};
    if (!now.description && c.description) p.description = c.description;
    if (!now.coverUrl && c.coverUrl) p.coverUrl = c.coverUrl;
    if (!now.subjects.length && c.subjects.length) p.subjects = c.subjects;
    if (!now.language && c.language) p.language = c.language;
    if (!now.pages && c.pages) p.pages = c.pages;
    if (!now.publisher && c.publisher) p.publisher = c.publisher;
    if (!now.year && c.year) p.year = c.year;
    if (!now.infoUrl && c.infoUrl) p.infoUrl = c.infoUrl;
    if (!Object.keys(p).length) return;
    commit(updateBook(lib, id, p, now.updatedAt), false);
    if (p.coverUrl) void fillSpineColor(id, p.coverUrl);
    onDone();
  } catch {
    enriched.delete(id); // try again another time
  }
}

/* ------------------------------------------------------------------ */
/* Where to borrow a book                                             */
/* ------------------------------------------------------------------ */

export const LIBRARY_PLACEHOLDER = 'XYZZY';

/** The user's own library search, with the placeholder replaced; null if not set up. */
export function myLibraryUrl(b: Pick<Book, 'title' | 'authors' | 'isbn'>): string | null {
  const tpl = settings.librarySearch;
  if (!tpl) return null;
  const q = encodeURIComponent(`${b.title} ${b.authors[0] ?? ''}`.trim());
  return tpl.replace(new RegExp(LIBRARY_PLACEHOLDER, 'i'), q);
}

/** Store a pasted library search address; returns false if it lacks the placeholder. */
export function saveLibrarySearch(url: string): boolean {
  const u = url.trim();
  if (!u) {
    updateSettings({ librarySearch: '' }, false);
    return true;
  }
  if (!/^https?:\/\//i.test(u) || !new RegExp(LIBRARY_PLACEHOLDER, 'i').test(u)) return false;
  updateSettings({ librarySearch: u }, false);
  return true;
}

