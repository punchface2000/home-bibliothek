/** One shelf: books as spines on wooden planks (or as a grid of covers). */
import { back, commit, go, lib, render, settings, t, updateSettings } from '../app';
import { hash, textOn } from '../color';
import { spineColor } from '../covers';
import { deleteShelf, filterBooks, moveShelf, renameShelf, sortBooks, SORT_KEYS, type Book, type SortKey } from '../library';
import { coverEl, segmented } from '../ui/components';
import { h, icon, iconButton } from '../ui/dom';
import { I } from '../ui/icons';
import { confirmSheet, openSheet, promptSheet, toast } from '../ui/overlay';
import type { View } from '../ui/view';

type Filter = 'all' | 'reading' | 'toread' | 'read' | 'wishlist';
const filters = new Map<string, Filter>();

const ROW_GAP = 1; // px between spines, keep in sync with .spine-row gap

/** Spine width in px from the page count (thin paperback … thick tome). */
export function spineWidth(b: Book): number {
  const pages = b.pages ?? 180 + (hash(b.id) % 260);
  return Math.round(Math.min(46, Math.max(16, 12 + pages / 22)));
}

/** Spine height as a fraction of the shelf height, varied a little per book. */
export function spineHeight(b: Book): number {
  return 0.74 + (hash(b.title + b.id) % 22) / 100;
}

const ROW_H = 196; // px, keep in sync with .spine-row height in style.css

function spineEl(b: Book): HTMLElement {
  const color = spineColor(b);
  const w = spineWidth(b);
  // German books print the spine bottom-to-top, English ones top-to-bottom
  const upward = (b.language ?? '').startsWith('de');
  const wide = w >= 30;
  const twoLines = w >= 36 && b.title.length > 18;
  // show the author's surname only if title and name both fit on the spine
  const fs = wide ? 12.5 : 11;
  const textPx = spineHeight(b) * (ROW_H - 12) - 34;
  const titlePx = (b.title.length * fs * 0.55) / (twoLines ? 2 : 1);
  const surname = b.authors[0]?.split(/\s+/).pop() ?? '';
  const showAuthor = wide && !!surname && titlePx + surname.length * fs * 0.62 + 14 < textPx;
  const style = `--spine:${color};--spine-ink:${textOn(color)};width:${w}px;height:${Math.round(spineHeight(b) * 100)}%`;
  const cls = ['spine', `st-${b.status}`, b.owned ? '' : 'ghost', upward ? 'up' : '', wide ? 'wide' : '', twoLines ? 'two' : ''].filter(Boolean).join(' ');
  return h(
    'button',
    { class: cls, type: 'button', style, dataset: { book: b.id }, 'aria-label': `${b.title}${b.authors[0] ? `, ${b.authors[0]}` : ''}`, onClick: () => go({ name: 'book', id: b.id }) },
    h('span', { class: 'spine-band top' }),
    h('span', { class: 'spine-text' }, h('span', { class: 'spine-title' }, b.title), showAuthor ? h('span', { class: 'spine-author' }, surname) : null),
    h('span', { class: 'spine-band bottom' }),
    b.status === 'reading' ? h('span', { class: 'ribbon', 'aria-hidden': 'true' }) : null
  );
}

/** Greedy packing of spine widths into rows of a given width. */
export function packRows(widths: number[], rowWidth: number, gap = ROW_GAP): number[][] {
  const rows: number[][] = [];
  let row: number[] = [];
  let used = 0;
  widths.forEach((w, i) => {
    const need = row.length ? w + gap : w;
    if (row.length && used + need > rowWidth) {
      rows.push(row);
      row = [];
      used = 0;
    }
    used += row.length ? w + gap : w;
    row.push(i);
  });
  if (row.length) rows.push(row);
  return rows;
}

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

  const caseEl = h('div', { class: 'bookcase' });
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

  if (!all.length || !shown.length) {
    content.append(
      chipRow ?? '',
      h(
        'div',
        { class: 'empty-shelf' },
        h('div', { class: 'bookcase' }, h('div', { class: 'shelf-row' }, h('div', { class: 'spine-row' })), h('div', { class: 'plank' })),
        h('p', null, all.length ? t.shelfFilterEmpty : t.shelfEmpty),
        !all.length ? h('button', { class: 'btn primary', type: 'button', onClick: () => go({ name: 'add', tab: 'scan', shelfId: id }) }, icon(I.plus), t.addBook) : null
      )
    );
  } else if (settings.shelfView === 'covers') {
    content.append(chipRow ?? '', h('div', { class: 'cover-grid' }, ...shown.map((b) => h('button', { class: 'cover-tile', type: 'button', dataset: { book: b.id }, onClick: () => go({ name: 'book', id: b.id }) }, coverEl(b, 'cover-fill'), h('span', { class: 'cover-tile-title' }, b.title)))));
  } else {
    content.append(chipRow ?? '', caseEl);
  }

  function layout(): void {
    if (settings.shelfView !== 'spines' || !shown.length || !caseEl.isConnected) return;
    const style = getComputedStyle(caseEl);
    const inner = caseEl.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const rows = packRows(shown.map(spineWidth), inner);
    // always draw at least 3 planks so a short shelf still looks like a bookcase
    while (rows.length < 3) rows.push([]);
    caseEl.replaceChildren(...rows.map((r) => h('div', { class: 'shelf-row' }, h('div', { class: 'spine-row' }, ...r.map((i) => spineEl(shown[i]))), h('div', { class: 'plank' }))));
  }

  const rerender = () => render();

  const onResize = () => layout();

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
