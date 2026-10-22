/**
 * App state shared by all views: the library, settings, language, the
 * catalog client, navigation and saving. Views import from here; main.ts
 * plugs in the renderer.
 */
import { Catalog, browserFetchJson } from './catalog';
import { resolveLang, STRINGS, type Strings } from './i18n';
import type { Lang, Library } from './library';
import { loadLibrary, loadSettings, saveLibrary, saveSettings, type Settings } from './storage';

export const settings: Settings = loadSettings();
export let lang: Lang = resolveLang(settings.lang);
export let t: Strings = STRINGS[lang];
export let lib: Library = loadLibrary([t.defaultShelf, t.wishlistShelf]);
export const catalog = new Catalog(browserFetchJson());

let renderer: () => void = () => {};
let onSaveFailed: () => void = () => {};

export function setRenderer(fn: () => void, saveFailed: () => void): void {
  renderer = fn;
  onSaveFailed = saveFailed;
}

export function render(): void {
  renderer();
}

/** Replace the library, save it, and (by default) redraw the current view. */
export function commit(next: Library, rerender = true): void {
  lib = next;
  if (!saveLibrary(lib)) onSaveFailed();
  if (rerender) render();
}

export function updateSettings(patch: Partial<Settings>, rerender = true): void {
  Object.assign(settings, patch);
  saveSettings(settings);
  if ('lang' in patch) {
    lang = resolveLang(settings.lang);
    t = STRINGS[lang];
    document.documentElement.lang = lang;
  }
  if ('theme' in patch) applyTheme();
  if (rerender) render();
}

export function applyTheme(): void {
  const root = document.documentElement;
  if (settings.theme === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = settings.theme;
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17110c' : '#f4ece0');
}

/* ------------------------------------------------------------------ */
/* Navigation (hash routes, so the browser back button works too)     */
/* ------------------------------------------------------------------ */

export type Route =
  | { name: 'home' }
  | { name: 'shelf'; id: string }
  | { name: 'book'; id: string }
  | { name: 'add'; tab: AddTab; shelfId?: string }
  | { name: 'find'; kind: 'author' | 'subject'; value: string }
  | { name: 'list'; filter: ListFilter }
  | { name: 'group'; kind: 'tag' | 'series'; value: string }
  | { name: 'stats' };

export type AddTab = 'scan' | 'search' | 'quote' | 'manual';
export type ListFilter = 'toread' | 'reading' | 'read' | 'abandoned' | 'wishlist' | 'lent';

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  const [a, b, c] = parts;
  if (a === 'shelf' && b) return { name: 'shelf', id: b };
  if (a === 'book' && b) return { name: 'book', id: b };
  if (a === 'add') return { name: 'add', tab: (['scan', 'search', 'quote', 'manual'] as AddTab[]).includes(b as AddTab) ? (b as AddTab) : 'scan', shelfId: c || undefined };
  if (a === 'find' && (b === 'author' || b === 'subject') && c) return { name: 'find', kind: b, value: c };
  if (a === 'list' && ['toread', 'reading', 'read', 'abandoned', 'wishlist', 'lent'].includes(b)) return { name: 'list', filter: b as ListFilter };
  if (a === 'group' && (b === 'tag' || b === 'series') && c) return { name: 'group', kind: b, value: c };
  if (a === 'stats') return { name: 'stats' };
  return { name: 'home' };
}

export function routeHash(r: Route): string {
  const e = encodeURIComponent;
  switch (r.name) {
    case 'home':
      return '#/';
    case 'shelf':
      return `#/shelf/${e(r.id)}`;
    case 'book':
      return `#/book/${e(r.id)}`;
    case 'add':
      return `#/add/${r.tab}${r.shelfId ? `/${e(r.shelfId)}` : ''}`;
    case 'find':
      return `#/find/${r.kind}/${e(r.value)}`;
    case 'list':
      return `#/list/${r.filter}`;
    case 'group':
      return `#/group/${r.kind}/${e(r.value)}`;
    case 'stats':
      return '#/stats';
  }
}

/** How many in-app pages are behind the current one (kept in history.state). */
const depth = () => (history.state && typeof history.state.d === 'number' ? history.state.d : 0);

export function initHistory(): void {
  history.replaceState({ d: depth() }, '', location.hash || '#/');
  window.addEventListener('popstate', () => render());
}

export function go(r: Route, replace = false): void {
  const hash = routeHash(r);
  if (location.hash === hash) return;
  if (replace) history.replaceState({ d: depth() }, '', hash);
  else history.pushState({ d: depth() + 1 }, '', hash);
  render();
}

/** Back within the app; if there's nowhere to go back to, go to `fallback`. */
export function back(fallback: Route = { name: 'home' }): void {
  if (depth() > 0) history.back();
  else go(fallback, true);
}

export function currentRoute(): Route {
  return parseRoute(location.hash);
}

export function shelfName(id: string): string {
  return lib.shelves.find((s) => s.id === id)?.name ?? '';
}
