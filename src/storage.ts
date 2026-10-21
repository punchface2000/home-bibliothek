/**
 * Saved data: settings and the library, in localStorage. Every read is
 * wrapped in try/catch and merged with defaults, so old saved data never
 * breaks a newer version of the app.
 */
import { sanitizeLibrary, type Library, type SortKey, type Status } from './library';

export type Theme = 'auto' | 'light' | 'dark';
export type LangSetting = 'auto' | 'en' | 'de';

export interface Settings {
  theme: Theme;
  lang: LangSetting;
  sort: SortKey;
  /** home screen: a library room with bookcases, or a grid of cards */
  homeView: 'room' | 'grid';
  /** how a shelf is shown: as spines on wood, or as a grid of covers */
  shelfView: 'spines' | 'covers';
  /** remembered choices of the last "add book" sheet */
  lastShelfId: string;
  lastStatus: Status;
  lastOwned: boolean;
  /** time of the last backup export, 0 = never */
  lastBackup: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  lang: 'auto',
  sort: 'author',
  homeView: 'room',
  shelfView: 'spines',
  lastShelfId: '',
  lastStatus: 'toread',
  lastOwned: true,
  lastBackup: 0
};

const KEY_SETTINGS = 'home-library.settings';
const KEY_LIBRARY = 'home-library.library';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY_SETTINGS);
    const parsed = raw ? JSON.parse(raw) : {};
    const s = { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) } as Settings;
    // guard against values from a future/past version that no longer exist
    if (!['auto', 'light', 'dark'].includes(s.theme)) s.theme = 'auto';
    if (!['auto', 'en', 'de'].includes(s.lang)) s.lang = 'auto';
    if (!['author', 'title', 'added', 'rating'].includes(s.sort)) s.sort = 'author';
    if (!['room', 'grid'].includes(s.homeView)) s.homeView = 'room';
    if (!['spines', 'covers'].includes(s.shelfView)) s.shelfView = 'spines';
    if (!['toread', 'reading', 'read', 'abandoned'].includes(s.lastStatus)) s.lastStatus = 'toread';
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
  } catch {
    /* storage unavailable: ignore */
  }
}

export function loadLibrary(defaultShelfNames: string[]): Library {
  try {
    const raw = localStorage.getItem(KEY_LIBRARY);
    return sanitizeLibrary(raw ? JSON.parse(raw) : null, defaultShelfNames);
  } catch {
    return sanitizeLibrary(null, defaultShelfNames);
  }
}

/** Returns false if the data could not be saved (storage full or blocked). */
export function saveLibrary(lib: Library): boolean {
  try {
    localStorage.setItem(KEY_LIBRARY, JSON.stringify(lib));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Backup files                                                       */
/* ------------------------------------------------------------------ */

export const BACKUP_APP = 'home-library';

export function backupJson(lib: Library, now = Date.now()): string {
  return JSON.stringify({ app: BACKUP_APP, version: 1, exportedAt: new Date(now).toISOString(), library: lib }, null, 1);
}

/** Parse a backup file. Accepts our wrapper or a bare library object. Returns null if unusable. */
export function parseBackup(text: string, defaultShelfNames: string[]): Library | null {
  try {
    const data = JSON.parse(text);
    const lib = data && typeof data === 'object' && 'library' in data ? data.library : data;
    if (!lib || typeof lib !== 'object' || !Array.isArray(lib.books)) return null;
    return sanitizeLibrary(lib, defaultShelfNames);
  } catch {
    return null;
  }
}

/** File name with the local date, e.g. home-library-2026-10-22.json */
export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `home-library-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
