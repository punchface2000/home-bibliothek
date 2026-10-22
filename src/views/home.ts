/** Home: the library room with one bookcase per shelf, search, and quick filters. */
import { addShelf, countBooks, isDigital, searchLibrary, sortBooks, type Book, type Shelf } from '../library';
import { shelfSort } from './shelf';
import { commit, go, lib, settings, t, updateSettings } from '../app';
import { textOn } from '../color';
import { spineColor } from '../covers';
import { bookRow, coverEl } from '../ui/components';
import { h, icon, iconButton } from '../ui/dom';
import { I } from '../ui/icons';
import { promptSheet } from '../ui/overlay';
import type { View } from '../ui/view';
import { roomEl } from './room';
import { backupReminder, helpSheet } from './help';
import { discoverSheet } from './discover';
import { settingsSheet } from './settings';

let query = '';

export function homeView(): View {
  const room = settings.homeView === 'room';
  const results = h('div', { class: 'scroll results-scroll', dataset: { scroll: 'home-search' } }, h('div', { class: 'results' }));
  const resultsList = results.firstElementChild as HTMLElement;
  const input = h('input', {
    class: 'search-input',
    type: 'search',
    placeholder: t.search,
    value: query,
    'aria-label': t.search,
    enterkeyhint: 'search',
    autocomplete: 'off',
    onInput: () => {
      query = input.value;
      update();
    }
  });
  const clearBtn = iconButton(I.close, t.clear, () => {
    query = '';
    input.value = '';
    update();
    input.focus();
  }, 'icon-btn search-clear');

  // the normal home content: the library room, or the grid of cards
  let roomPart: ReturnType<typeof roomEl> | null = null;
  let body: HTMLElement;
  if (room) {
    roomPart = roomEl();
    body = h('div', { class: 'home-room' }, h('div', { class: 'home-room-top' }, ...topParts(true)), roomPart.el);
  } else {
    const main = h('div', { class: 'home-main' });
    buildMain(main);
    body = h('div', { class: 'scroll', dataset: { scroll: 'home' } }, main);
  }

  function update(): void {
    const q = query.trim();
    clearBtn.hidden = !query;
    body.hidden = !!q;
    results.hidden = !q;
    if (!q) return;
    const { best, possible } = searchLibrary(lib.books, q);
    resultsList.replaceChildren(
      ...best.map((b) => bookRow(b)),
      ...(possible.length ? [h('h3', { class: 'results-divider' }, best.length ? t.possibleMatches : t.closeMatchesOnly), ...possible.map((b) => bookRow(b))] : []),
      ...(!best.length && !possible.length ? [h('p', { class: 'empty-note' }, t.noMatches)] : [])
    );
  }
  update();

  const el = h(
    'div',
    { class: `view view-home${room ? ' is-room' : ''}` },
    h(
      'header',
      { class: 'topbar' },
      h('h1', { class: 'brand' }, t.appTitle),
      h(
        'div',
        { class: 'topbar-actions' },
        iconButton(room ? I.grid : I.room, room ? t.viewGrid : t.viewRoom, () => updateSettings({ homeView: room ? 'grid' : 'room' })),
        iconButton(I.sparkle, t.discoverTitle, () => discoverSheet()),
        iconButton(I.help, t.help, () => helpSheet()),
        iconButton(I.gear, t.settings, () => settingsSheet())
      )
    ),
    h('div', { class: 'search' }, icon(I.search, 'icon search-icon'), input, clearBtn),
    body,
    results,
    h('button', { class: 'fab', type: 'button', 'aria-label': t.addBook, title: t.addBook, onClick: () => go({ name: 'add', tab: 'scan' }) }, icon(I.plus))
  );
  return {
    el,
    mounted: () => roomPart?.mounted(),
    cleanup: () => roomPart?.cleanup()
  };
}

/** Welcome note (empty library) or the status chips. */
function topParts(compact: boolean): HTMLElement[] {
  const c = countBooks(lib.books);
  if (!lib.books.length)
    return [
      h(
        'div',
        { class: 'welcome' + (compact ? ' compact' : '') },
        h('h2', null, t.emptyTitle),
        compact ? null : h('p', null, t.emptyText),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn primary', type: 'button', onClick: () => go({ name: 'add', tab: 'scan' }) }, icon(I.barcode), t.scanBarcode),
          h('button', { class: 'btn', type: 'button', onClick: () => go({ name: 'add', tab: 'search' }) }, icon(I.search), t.searchTitle)
        )
      )
    ];
  const chips: [string, number, () => void][] = [
    [t.status.reading, c.reading, () => go({ name: 'list', filter: 'reading' })],
    [t.status.toread, c.toread, () => go({ name: 'list', filter: 'toread' })],
    [t.status.read, c.read, () => go({ name: 'list', filter: 'read' })],
    [t.wishlist, c.wishlist, () => go({ name: 'list', filter: 'wishlist' })],
    [t.lentOut, c.lent, () => go({ name: 'list', filter: 'lent' })],
    [t.status.abandoned, c.abandoned, () => go({ name: 'list', filter: 'abandoned' })]
  ];
  const nudge = backupReminder();
  return [
    ...(nudge ? [nudge] : []),
    h(
      'div',
      { class: 'chips' },
      ...chips.filter(([, n], i) => n > 0 || i < 3).map(([label, n, run]) => h('button', { class: 'chip', type: 'button', onClick: run }, label, h('b', null, String(n))))
    )
  ];
}

function buildMain(main: HTMLElement): void {
  main.append(...topParts(false));
  if (lib.books.length) {
    const reading = lib.books.filter((b) => b.status === 'reading');
    if (reading.length)
      main.append(
        h('h2', { class: 'section-title' }, t.readingNow),
        h(
          'div',
          { class: 'reading-strip' },
          ...reading.map((b) =>
            h(
              'button',
              { class: 'reading-item', type: 'button', dataset: { book: b.id }, onClick: () => go({ name: 'book', id: b.id }) },
              coverEl(b, 'cover-sm'),
              b.pages && b.currentPage ? h('span', { class: 'mini-progress' }, h('span', { style: `width:${Math.min(100, Math.round((b.currentPage / b.pages) * 100))}%` })) : null,
              h('span', { class: 'reading-title' }, b.title)
            )
          )
        )
      );
  }
  main.append(
    h(
      'div',
      { class: 'cases' },
      ...lib.shelves.map((s) => bookcase(s, lib.books.filter((b) => b.shelfId === s.id))),
      h(
        'button',
        {
          class: 'case case-new',
          type: 'button',
          onClick: async () => {
            const name = await promptSheet(t.newShelf, t.shelfName, '', t.add);
            if (name) commit(addShelf(lib, name).lib);
          }
        },
        icon(I.plus),
        h('span', null, t.newShelf)
      )
    )
  );
}

/** A small bookcase on the home screen with mini spines and a brass name plate. */
function bookcase(s: Shelf, books: Book[]): HTMLElement {
  const sorted = sortBooks(books.filter((b) => !isDigital(b)), shelfSort(s.id));
  const PER_ROW = 16;
  const rows = [0, 1, 2].map((r) =>
    h(
      'div',
      { class: 'mini-row' },
      ...sorted.slice(r * PER_ROW, (r + 1) * PER_ROW).map((b) => {
        const color = spineColor(b);
        const w = 4 + Math.min(5, Math.round((b.pages ?? 280) / 160));
        const hgt = 70 + ((b.title.length * 7 + (b.pages ?? 0)) % 28);
        return h('span', { class: 'mini-spine' + (b.owned ? '' : ' ghost'), dataset: { book: b.id }, style: `--spine:${color};--spine-ink:${textOn(color)};width:${w}px;height:${hgt}%` });
      })
    )
  );
  return h(
    'button',
    { class: 'case', type: 'button', onClick: () => go({ name: 'shelf', id: s.id }) },
    h('div', { class: 'case-inner' }, ...rows),
    h('div', { class: 'plate' }, h('span', { class: 'plate-name' }, s.name), h('span', { class: 'plate-count' }, t.books(books.length)))
  );
}
