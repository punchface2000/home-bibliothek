import { beforeEach, describe, expect, it } from 'vitest';
import { addBook, emptyLibrary } from './library';
import { backupFileName, backupJson, DEFAULT_SETTINGS, loadLibrary, loadSettings, parseBackup, saveLibrary, saveSettings } from './storage';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe('storage', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
  });

  it('returns defaults when nothing is saved', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    const lib = loadLibrary(['My books', 'Wishlist']);
    expect(lib.shelves.map((s) => s.name)).toEqual(['My books', 'Wishlist']);
  });

  it('merges old settings with new defaults and drops bad values', () => {
    localStorage.setItem('home-library.settings', JSON.stringify({ theme: 'dark', sort: 'nonsense', extra: 1 }));
    const s = loadSettings();
    expect(s.theme).toBe('dark');
    expect(s.sort).toBe('author');
    expect(s.lang).toBe('auto');
  });

  it('survives corrupt JSON', () => {
    localStorage.setItem('home-library.settings', '{oops');
    localStorage.setItem('home-library.library', '{oops');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadLibrary(['A']).shelves).toHaveLength(1);
  });

  it('round-trips settings and library', () => {
    saveSettings({ ...DEFAULT_SETTINGS, lang: 'de' });
    expect(loadSettings().lang).toBe('de');
    const lib = addBook(emptyLibrary(['A']), { title: 'Momo' }).lib;
    expect(saveLibrary(lib)).toBe(true);
    expect(loadLibrary(['X']).books[0].title).toBe('Momo');
  });

  it('reports a failed save', () => {
    (globalThis as unknown as { localStorage: object }).localStorage = {
      setItem() {
        throw new Error('QuotaExceeded');
      }
    };
    expect(saveLibrary(emptyLibrary(['A']))).toBe(false);
  });

  it('exports and parses backups', () => {
    const lib = addBook(emptyLibrary(['A']), { title: 'Momo', rating: 4 }).lib;
    const text = backupJson(lib, 0);
    expect(JSON.parse(text).app).toBe('home-library');
    expect(parseBackup(text, ['X'])?.books[0].rating).toBe(4);
    expect(parseBackup(JSON.stringify(lib), ['X'])?.books).toHaveLength(1);
    expect(parseBackup('not json', ['X'])).toBeNull();
    expect(parseBackup('{"hello":1}', ['X'])).toBeNull();
    expect(backupFileName(new Date(2026, 9, 21, 23, 59))).toBe('home-library-2026-10-21.json');
  });
});
