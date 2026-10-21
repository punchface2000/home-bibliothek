/** Home: the library room with one bookcase per shelf, search, and quick filters. */
import { addShelf, countBooks, searchBooks, sortBooks, type Book, type Shelf } from '../library';
import { commit, go, lib, settings, t } from '../app';
import { textOn } from '../color';
import { spineColor } from '../covers';
import { bookRow, coverEl } from '../ui/components';
import { h, icon, iconButton } from '../ui/dom';
import { I } from '../ui/icons';
import { promptSheet } from '../ui/overlay';
import type { View } from '../ui/view';
import { askClaudeSheet, settingsSheet } from './settings';

let query = '';

export function homeView(): View {
  const results = h('div', { class: 'results' });
  const main = h('div', { class: 'home-main' });
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

  function update(): void {
    const q = query.trim();
    clearBtn.hidden = !query;
    main.hidden = !!q;
    results.hidden = !q;
    if (!q) return;
    const found = searchBooks(lib.books, q);
    results.replaceChildren(...(found.length ? found.map((b) => bookRow(b)) : [h('p', { class: 'empty-note' }, t.noMatches)]));
  }

  buildMain(main);
  update();

  const el = h(
    'div',
    { class: 'view view-home' },
    h(
      'header',
      { class: 'topbar' },
      h('h1', { class: 'brand' }, t.appTitle),
      h('div', { class: 'topbar-actions' }, iconButton(I.sparkle, t.askClaude, () => askClaudeSheet()), iconButton(I.gear, t.settings, () => settingsSheet()))
    ),
    h('div', { class: 'search' }, icon(I.search, 'icon search-icon'), input, clearBtn),
    h('div', { class: 'scroll', dataset: { scroll: 'home' } }, main, results),
    h('button', { class: 'fab', type: 'button', 'aria-label': t.addBook, title: t.addBook, onClick: () => go({ name: 'add', tab: 'scan' }) }, icon(I.plus))
  );
  return { el };
}

function buildMain(main: HTMLElement): void {
  const c = countBooks(lib.books);
  if (!lib.books.length) {
    main.append(
      h(
        'div',
        { class: 'welcome' },
        h('h2', null, t.emptyTitle),
        h('p', null, t.emptyText),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn primary', type: 'button', onClick: () => go({ name: 'add', tab: 'scan' }) }, icon(I.barcode), t.scanBarcode),
          h('button', { class: 'btn', type: 'button', onClick: () => go({ name: 'add', tab: 'search' }) }, icon(I.search), t.searchTitle)
        )
      )
    );
  } else {
    const chips: [string, number, () => void][] = [
      [t.status.reading, c.reading, () => go({ name: 'list', filter: 'reading' })],
      [t.status.toread, c.toread, () => go({ name: 'list', filter: 'toread' })],
      [t.status.read, c.read, () => go({ name: 'list', filter: 'read' })],
      [t.wishlist, c.wishlist, () => go({ name: 'list', filter: 'wishlist' })],
      [t.status.abandoned, c.abandoned, () => go({ name: 'list', filter: 'abandoned' })]
    ];
    main.append(
      h(
        'div',
        { class: 'chips' },
        ...chips.filter(([, n], i) => n > 0 || i < 3).map(([label, n, run]) => h('button', { class: 'chip', type: 'button', onClick: run }, label, h('b', null, String(n))))
      )
    );
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
  const sorted = sortBooks(books, settings.sort);
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
