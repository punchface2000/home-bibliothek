/** One shelf: books as spines in a real-looking bookcase (or as a grid of covers). */
import { back, commit, go, lib, render, settings, t, updateSettings } from '../app';
import { deleteShelf, filterBooks, moveShelf, renameShelf, sortBooks, SORT_KEYS, type SortKey } from '../library';
import { fitRows } from '../shelfLayout';
import { bookcaseEl, caseRows, PLANK_H, ROW_H } from '../ui/bookcase';
import { coverEl, segmented } from '../ui/components';
import { h, icon, iconButton } from '../ui/dom';
import { I } from '../ui/icons';
import { confirmSheet, openSheet, promptSheet, toast } from '../ui/overlay';
import type { View } from '../ui/view';

type Filter = 'all' | 'reading' | 'toread' | 'read' | 'wishlist';
const filters = new Map<string, Filter>();

export function shelfView(id: string): View {
  const shelf = lib.shelves.find((s) => s.id === id);
  if (!shelf) {
    window.setTimeout(() => go({ name: 'home' }, true));
    return { el: h('div', { class: 'view' }) };
  }
  const filter = filters.get(id) ?? 'all';
  const all = lib.books.filter((b) => b.shelfId === id);
  const shown = sortBooks(
    filter === 'all' ? all : filter === 'wishlist' ? filterBooks(all, { owned: false }) : filterBooks(all, { status: filter }),
    settings.sort
  );

  const { el: caseEl, body: caseBody } = bookcaseEl('bookcase-full');
  const content = h('div', { class: 'scroll', dataset: { scroll: `shelf-${id}` } });

  const counts: Record<Filter, number> = {
    all: all.length,
    reading: all.filter((b) => b.status === 'reading').length,
    toread: all.filter((b) => b.status === 'toread').length,
    read: all.filter((b) => b.status === 'read').length,
    wishlist: all.filter((b) => !b.owned).length
  };
  const filterLabels: Record<Filter, string> = { all: t.all, reading: t.status.reading, toread: t.status.toread, read: t.status.read, wishlist: t.wishlist };
  const chipRow =
    all.length > 0
      ? h(
          'div',
          { class: 'chips chips-filter' },
          ...(Object.keys(filterLabels) as Filter[])
            .filter((f) => f === 'all' || counts[f] > 0 || f === filter)
            .map((f) =>
              h(
                'button',
                {
                  class: 'chip',
                  type: 'button',
                  'aria-pressed': String(f === filter),
                  onClick: () => {
                    filters.set(id, f);
                    rerender();
                  }
                },
                filterLabels[f],
                h('b', null, String(counts[f]))
              )
            )
        )
      : null;

  const empty = !shown.length;
  if (!empty && settings.shelfView === 'covers') {
    content.append(chipRow ?? '', h('div', { class: 'cover-grid' }, ...shown.map((b) => h('button', { class: 'cover-tile', type: 'button', dataset: { book: b.id }, onClick: () => go({ name: 'book', id: b.id }) }, coverEl(b, 'cover-fill'), h('span', { class: 'cover-tile-title' }, b.title)))));
  } else {
    // an empty shelf still shows the whole bookcase, with a short note above it
    const note = empty
      ? h(
          'div',
          { class: 'shelf-note' },
          h('span', null, all.length ? t.shelfFilterEmpty : t.shelfEmpty),
          !all.length ? h('button', { class: 'btn small primary', type: 'button', onClick: () => go({ name: 'add', tab: 'scan', shelfId: id }) }, icon(I.plus), t.addBook) : null
        )
      : null;
    content.append(chipRow ?? '', note ?? '', caseEl);
  }

  function layout(): void {
    if (!caseEl.isConnected) return;
    const cs = getComputedStyle(caseBody);
    const inner = caseBody.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    // fill the visible height with planks, like a real bookcase
    const crown = (caseEl.firstElementChild as HTMLElement).offsetHeight;
    const base = (caseEl.lastElementChild as HTMLElement).offsetHeight;
    const top = caseEl.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop;
    const avail = content.clientHeight - top - crown - base - 20;
    const { rows, rowHeight } = fitRows(avail, ROW_H + PLANK_H, PLANK_H, 3);
    caseBody.replaceChildren(...caseRows({ books: shown, width: inner, rowHeight: Math.min(rowHeight, 240), minRows: rows, seed: id, onBook: (b) => go({ name: 'book', id: b.id }) }));
  }

  const rerender = () => render();

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(layout, 120);
  };

  const el = h(
    'div',
    { class: 'view view-shelf' },
    h(
      'header',
      { class: 'topbar' },
      iconButton(I.back, t.back, () => back()),
      h('h1', { class: 'topbar-title' }, shelf.name),
      h(
        'div',
        { class: 'topbar-actions' },
        iconButton(settings.shelfView === 'spines' ? I.grid : I.spines, settings.shelfView === 'spines' ? t.viewCovers : t.viewSpines, () =>
          updateSettings({ shelfView: settings.shelfView === 'spines' ? 'covers' : 'spines' })
        ),
        iconButton(I.sort, t.sortBy, () => sortSheet()),
        iconButton(I.more, t.edit, () => shelfMenu(id))
      )
    ),
    content,
    h('button', { class: 'fab', type: 'button', 'aria-label': t.addBook, title: t.addBook, onClick: () => go({ name: 'add', tab: 'scan', shelfId: id }) }, icon(I.plus))
  );

  return {
    el,
    mounted() {
      layout();
      window.addEventListener('resize', onResize);
    },
    cleanup() {
      window.removeEventListener('resize', onResize);
    }
  };
}

function sortSheet(): void {
  openSheet(t.sortBy, (body, close) => {
    body.append(
      segmented<SortKey>(
        SORT_KEYS.map((k) => ({ value: k, label: t.sort[k] })),
        settings.sort,
        (v) => {
          updateSettings({ sort: v });
          close();
        },
        'seg-vertical'
      )
    );
  });
}

function shelfMenu(id: string): void {
  const shelf = lib.shelves.find((s) => s.id === id)!;
  const idx = lib.shelves.indexOf(shelf);
  openSheet(shelf.name, (body, close) => {
    const item = (svg: string, label: string, run: () => void, disabled = false, cls = '') =>
      h('button', { class: `menu-item ${cls}`, type: 'button', disabled, onClick: () => (close(), run()) }, icon(svg), h('span', null, label));
    body.append(
      h(
        'div',
        { class: 'menu' },
        item(I.pen, t.renameShelf, async () => {
          const name = await promptSheet(t.renameShelf, t.shelfName, shelf.name);
          if (name) commit(renameShelf(lib, id, name));
        }),
        item(I.back, t.moveLeft, () => commit(moveShelf(lib, id, -1)), idx === 0),
        item(I.chevron, t.moveRight, () => commit(moveShelf(lib, id, 1)), idx === lib.shelves.length - 1),
        item(
          I.trash,
          t.deleteShelf,
          async () => {
            if (lib.shelves.length <= 1) return toast(t.lastShelf);
            const n = lib.books.filter((b) => b.shelfId === id).length;
            const target = lib.shelves.find((s) => s.id !== id)!;
            if (await confirmSheet(t.deleteShelf, t.deleteShelfConfirm(shelf.name, n, target.name), t.delete, true)) {
              commit(deleteShelf(lib, id, target.id));
              go({ name: 'home' }, true);
            }
          },
          false,
          'danger'
        )
      )
    );
  });
}
