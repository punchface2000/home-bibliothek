import '@fontsource/literata/latin-400.css';
import '@fontsource/literata/latin-400-italic.css';
import '@fontsource/literata/latin-600.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { backfillSpineColors } from './actions';
import { applyTheme, currentRoute, initHistory, lang, setRenderer, settings, t } from './app';
import { closeAllSheets, toast } from './ui/overlay';
import type { View } from './ui/view';
import { addView } from './views/add';
import { bookView } from './views/book';
import { homeView } from './views/home';
import { findView, listView } from './views/lists';
import { shelfView } from './views/shelf';

const root = document.getElementById('app')!;
let current: View | null = null;
let currentHash = '';
/** scroll positions per page, so "back" returns to where you were */
const scrollPos = new Map<string, number>();

function build(): View {
  const r = currentRoute();
  switch (r.name) {
    case 'shelf':
      return shelfView(r.id);
    case 'book':
      return bookView(r.id);
    case 'add':
      return addView(r.tab, r.shelfId);
    case 'find':
      return findView(r.kind, r.value);
    case 'list':
      return listView(r.filter);
    default:
      return homeView();
  }
}

function render(): void {
  const hash = location.hash || '#/';
  const samePage = hash === currentHash;
  const oldScroll = root.querySelector<HTMLElement>('.scroll');
  if (oldScroll) scrollPos.set(currentHash, oldScroll.scrollTop);
  if (!samePage) closeAllSheets();
  current?.cleanup?.();
  current = build();
  currentHash = hash;
  document.documentElement.lang = lang;
  root.replaceChildren(current.el);
  current.mounted?.();
  const scroll = current.el.querySelector<HTMLElement>('.scroll');
  if (scroll) scroll.scrollTop = scrollPos.get(hash) ?? 0;
}

setRenderer(render, () => toast(t.saveFailed));
initHistory();
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => settings.theme === 'auto' && applyTheme());
render();

// keep the app fresh: the new version is used the next time it's opened
registerSW({ immediate: true });

// fetch spine colors for books added offline or imported, once there's a connection
window.setTimeout(() => void backfillSpineColors(), 1500);
window.addEventListener('online', () => void backfillSpineColors());
