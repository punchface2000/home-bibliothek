/**
 * One shelf: books as spines in a real-looking bookcase (or as a grid of
 * covers), ebooks and audiobooks in a "Digital" section below. Filters by
 * status, lending and tags; select mode to move or delete several books;
 * arrange mode to drag books into your own order.
 */
import { offerUndo } from '../actions';
import { back, commit, go, lib, render, settings, t, updateSettings } from '../app';
import {
  allTags,
  deleteShelf,
  filterBooks,
  isDigital,
  moveBooks,
  moveShelf,
  removeBooks,
  renameShelf,
  reorderIds,
  setShelfOrder,
  setShelfSort,
  sortBooks,
  SORT_KEYS,
  type Book,
  type SortKey
} from '../library';
import { fitRows } from '../shelfLayout';
import { bookcaseEl, caseRows, PLANK_H, ROW_H } from '../ui/bookcase';
import { coverEl, segmented } from '../ui/components';
import { h, icon, iconButton } from '../ui/dom';
import { I } from '../ui/icons';
import { confirmSheet, openSheet, promptSheet, toast } from '../ui/overlay';
import type { View } from '../ui/view';

/** 'all' | status | 'wishlist' | 'lent' | 'tag:<name>' — remembered per shelf while the app is open */
const filters = new Map<string, string>();
/** select mode: the selected book ids, per shelf */
let selecting: { shelfId: string; ids: Set<string> } | null = null;
let arranging: string | null = null;

export const shelfSort = (shelfId: string): SortKey => lib.shelves.find((s) => s.id === shelfId)?.sort ?? settings.sort;

export function shelfView(id: string): View {
  const shelf = lib.shelves.find((s) => s.id === id);
  if (!shelf) {
    window.setTimeout(() => go({ name: 'home' }, true));
    return { el: h('div', { class: 'view' }) };
  }
  if (selecting && selecting.shelfId !== id) selecting = null;
  if (arranging && arranging !== id) arranging = null;
  const sel = selecting?.ids ?? null;
  const sort = shelfSort(id);

  let filter = arranging ? 'all' : filters.get(id) ?? 'all';
  const all = lib.books.filter((b) => b.shelfId === id);
  const tags = allTags(all);
  const apply = (f: string): Book[] =>
    f === 'all'
      ? all
      : f === 'wishlist'
        ? filterBooks(all, { owned: false })
        : f === 'lent'
          ? filterBooks(all, { lent: true })
          : f.startsWith('tag:')
            ? filterBooks(all, { tag: f.slice(4) })
            : filterBooks(all, { status: f as Book['status'] });
  if (filter !== 'all' && !apply(filter).length) filter = 'all';
  const shown = sortBooks(apply(filter), sort);
  const physical = shown.filter((b) => !isDigital(b));
  const digital = shown.filter(isDigital);

  const onBook = (b: Book) => {
    if (sel) {
      if (sel.has(b.id)) sel.delete(b.id);
      else sel.add(b.id);
      render();
    } else if (!arranging) go({ name: 'book', id: b.id });
  };

  const { el: caseEl, body: caseBody } = bookcaseEl('bookcase-full');
  const content = h('div', { class: 'scroll', dataset: { scroll: `shelf-${id}` } });

  /* ---------- filter chips ---------- */
  const labels: [string, string][] = [
    ['all', t.all],
    ['reading', t.status.reading],
    ['toread', t.status.toread],
    ['read', t.status.read],
    ['wishlist', t.wishlist],
    ['lent', t.lentOut],
    ['abandoned', t.status.abandoned],
    ...tags.map((x): [string, string] => [`tag:${x.tag}`, `#${x.tag}`])
  ];
  const chipRow =
    all.length > 0 && !arranging
      ? h(
          'div',
          { class: 'chips chips-filter' },
          ...labels
            .map(([f, label]) => [f, label, apply(f).length] as const)
            .filter(([f, , n]) => f === 'all' || n > 0)
            .map(([f, label, n]) =>
              h(
                'button',
                {
                  class: 'chip' + (f.startsWith('tag:') ? ' chip-tag' : ''),
                  type: 'button',
                  'aria-pressed': String(f === filter),
                  onClick: () => {
                    filters.set(id, f);
                    render();
                  }
                },
                label,
                h('b', null, String(n))
              )
            )
        )
      : null;

  /* ---------- mode banners ---------- */
  let banner: HTMLElement | null = null;
  if (arranging) banner = h('div', { class: 'shelf-note arrange-note' }, h('span', null, t.arrangeHint), h('button', { class: 'btn small primary', type: 'button', onClick: () => ((arranging = null), render()) }, t.done));
  else if (sel) banner = h('div', { class: 'shelf-note' }, h('span', null, sel.size ? t.nSelected(sel.size) : t.tapToSelect), h('button', { class: 'btn small', type: 'button', onClick: () => ((selecting = null), render()) }, t.cancel));

  /* ---------- content ---------- */
  const empty = !shown.length;
  const coverTile = (b: Book) =>
    h(
      'button',
      { class: 'cover-tile' + (sel?.has(b.id) ? ' selected' : '') + (b.lentTo ? ' lent' : ''), type: 'button', dataset: { book: b.id }, 'aria-pressed': sel ? String(sel.has(b.id)) : undefined, onClick: () => onBook(b) },
      coverEl(b, 'cover-fill'),
      h('span', { class: 'cover-tile-title' }, b.title),
      b.lentTo ? h('span', { class: 'pill pill-lent' }, b.lentTo) : null
    );

  if (!empty && settings.shelfView === 'covers' && !arranging) {
    content.append(chipRow ?? '', banner ?? '', h('div', { class: 'cover-grid' }, ...shown.map(coverTile)));
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
    content.append(chipRow ?? '', banner ?? note ?? '', caseEl);
    if (digital.length) content.append(h('section', { class: 'digital' }, h('h2', { class: 'section-title' }, t.digital), h('div', { class: 'cover-grid digital-grid' }, ...digital.map(coverTile))));
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
    caseBody.replaceChildren(...caseRows({ books: physical, width: inner, rowHeight: Math.min(rowHeight, 240), minRows: rows, seed: id, onBook, selected: sel ?? undefined }));
    caseBody.classList.toggle('arranging', !!arranging);
  }

  /* ---------- arrange: drag spines into your own order ---------- */
  let drag: { id: string; ghost: HTMLElement; src: HTMLElement; target: { el: HTMLElement; before: boolean } | null; dx: number; dy: number; scrollTimer: number } | null = null;

  function clearMarks(): void {
    caseBody.querySelectorAll('.drop-before, .drop-after').forEach((e) => e.classList.remove('drop-before', 'drop-after'));
  }

  function onPointerDown(e: PointerEvent): void {
    if (!arranging) return;
    const src = (e.target as HTMLElement).closest<HTMLElement>('.spine');
    if (!src || !src.dataset.book) return;
    e.preventDefault();
    const r = src.getBoundingClientRect();
    const ghost = src.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    Object.assign(ghost.style, { width: `${r.width}px`, height: `${r.height}px`, left: `${r.left}px`, top: `${r.top}px` });
    document.body.appendChild(ghost);
    src.classList.add('dragging');
    drag = { id: src.dataset.book, ghost, src, target: null, dx: e.clientX - r.left, dy: e.clientY - r.top, scrollTimer: 0 };
    caseBody.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!drag) return;
    drag.ghost.style.left = `${e.clientX - drag.dx}px`;
    drag.ghost.style.top = `${e.clientY - drag.dy}px`;
    // scroll the page when dragging near the top or bottom edge
    const cr = content.getBoundingClientRect();
    clearInterval(drag.scrollTimer);
    const edge = e.clientY < cr.top + 60 ? -1 : e.clientY > cr.bottom - 60 ? 1 : 0;
    if (edge) drag.scrollTimer = window.setInterval(() => (content.scrollTop += edge * 8), 16);
    clearMarks();
    drag.target = null;
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const spine = under?.closest<HTMLElement>('.spine');
    if (spine && spine !== drag.src && caseBody.contains(spine)) {
      const r = spine.getBoundingClientRect();
      const before = e.clientX < r.left + r.width / 2;
      spine.classList.add(before ? 'drop-before' : 'drop-after');
      drag.target = { el: spine, before };
      return;
    }
    // empty space on a plank: after its last book
    const row = under?.closest<HTMLElement>('.spine-row');
    if (row && caseBody.contains(row)) {
      const spines = [...row.querySelectorAll<HTMLElement>('.spine')].filter((x) => x !== drag!.src);
      const last = spines[spines.length - 1];
      if (last) {
        last.classList.add('drop-after');
        drag.target = { el: last, before: false };
      }
    }
  }

  function onPointerUp(): void {
    if (!drag) return;
    const d = drag;
    drag = null;
    clearInterval(d.scrollTimer);
    d.ghost.remove();
    d.src.classList.remove('dragging');
    clearMarks();
    if (!d.target) return;
    const ids = physical.map((b) => b.id);
    const targetId = d.target.el.dataset.book!;
    let beforeId: string | null = targetId;
    if (!d.target.before) {
      const i = ids.indexOf(targetId);
      beforeId = ids[i + 1] === d.id ? ids[i + 2] ?? null : ids[i + 1] ?? null;
    }
    const order = [...reorderIds(ids, d.id, beforeId), ...digital.map((b) => b.id)];
    commit(setShelfOrder(lib, order), false);
    render();
  }

  caseBody.addEventListener('pointerdown', onPointerDown);
  caseBody.addEventListener('pointermove', onPointerMove);
  caseBody.addEventListener('pointerup', onPointerUp);
  caseBody.addEventListener('pointercancel', onPointerUp);

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(layout, 120);
  };

  /* ---------- select mode action bar ---------- */
  const actionBar = sel
    ? h(
        'div',
        { class: 'action-bar' },
        h('button', { class: 'btn', type: 'button', disabled: !sel.size, onClick: () => moveSheet(id, [...sel]) }, icon(I.move), t.moveTo),
        h(
          'button',
          {
            class: 'btn danger',
            type: 'button',
            disabled: !sel.size,
            onClick: async () => {
              const n = sel.size;
              if (!(await confirmSheet(t.delete, t.deleteSelectedConfirm(n), t.delete, true))) return;
              const before = lib;
              selecting = null;
              commit(removeBooks(lib, sel));
              offerUndo(t.booksDeleted(n), before);
            }
          },
          icon(I.trash),
          t.delete
        )
      )
    : null;

  const el = h(
    'div',
    { class: 'view view-shelf' + (sel ? ' is-selecting' : '') },
    h(
      'header',
      { class: 'topbar' },
      iconButton(I.back, t.back, () => ((selecting = null), (arranging = null), back())),
      h('h1', { class: 'topbar-title' }, shelf.name),
      h(
        'div',
        { class: 'topbar-actions' },
        iconButton(settings.shelfView === 'spines' ? I.grid : I.spines, settings.shelfView === 'spines' ? t.viewCovers : t.viewSpines, () =>
          updateSettings({ shelfView: settings.shelfView === 'spines' ? 'covers' : 'spines' })
        ),
        iconButton(I.sort, t.sortBy, () => sortSheet(id)),
        iconButton(I.more, t.edit, () => shelfMenu(id, physical))
      )
    ),
    content,
    actionBar,
    sel || arranging ? null : h('button', { class: 'fab', type: 'button', 'aria-label': t.addBook, title: t.addBook, onClick: () => go({ name: 'add', tab: 'scan', shelfId: id }) }, icon(I.plus))
  );

  return {
    el,
    mounted() {
      layout();
      window.addEventListener('resize', onResize);
    },
    cleanup() {
      window.removeEventListener('resize', onResize);
      if (drag) {
        drag.ghost.remove();
        clearInterval(drag.scrollTimer);
      }
    }
  };
}

function sortSheet(shelfId: string): void {
  openSheet(t.sortBy, (body, close) => {
    body.append(
      segmented<SortKey>(
        SORT_KEYS.map((k) => ({ value: k, label: t.sort[k] })),
        shelfSort(shelfId),
        (v) => {
          commit(setShelfSort(lib, shelfId, v));
          close();
        },
        'seg-vertical'
      )
    );
  });
}

function moveSheet(fromShelf: string, ids: string[]): void {
  openSheet(t.moveTo, (body, close) => {
    body.append(
      h(
        'div',
        { class: 'menu' },
        ...lib.shelves
          .filter((s) => s.id !== fromShelf)
          .map((s) =>
            h(
              'button',
              {
                class: 'menu-item',
                type: 'button',
                onClick: () => {
                  close();
                  const before = lib;
                  selecting = null;
                  commit(moveBooks(lib, ids, s.id));
                  offerUndo(t.moved(ids.length, s.name), before);
                }
              },
              icon(I.room),
              h('span', null, s.name)
            )
          )
      )
    );
  });
}

function shelfMenu(id: string, physical: Book[]): void {
  const shelf = lib.shelves.find((s) => s.id === id)!;
  const idx = lib.shelves.indexOf(shelf);
  const count = lib.books.filter((b) => b.shelfId === id).length;
  openSheet(shelf.name, (body, close) => {
    const item = (svg: string, label: string, run: () => void, disabled = false, cls = '') =>
      h('button', { class: `menu-item ${cls}`, type: 'button', disabled, onClick: () => (close(), run()) }, icon(svg), h('span', null, label));
    body.append(
      h(
        'div',
        { class: 'menu' },
        item(I.select, t.selectBooks, () => ((selecting = { shelfId: id, ids: new Set() }), render()), !count),
        item(
          I.move,
          t.arrange,
          () => {
            // start from what you see now, then switch this shelf to "My order"
            if (shelfSort(id) !== 'manual') {
              const rest = lib.books.filter((b) => b.shelfId === id && !physical.includes(b));
              commit(setShelfOrder(setShelfSort(lib, id, 'manual'), [...physical, ...sortBooks(rest, shelfSort(id))].map((b) => b.id)), false);
            }
            filters.set(id, 'all');
            if (settings.shelfView !== 'spines') updateSettings({ shelfView: 'spines' }, false);
            arranging = id;
            render();
          },
          count < 2
        ),
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
            const target = lib.shelves.find((s) => s.id !== id)!;
            if (await confirmSheet(t.deleteShelf, t.deleteShelfConfirm(shelf.name, count, target.name), t.delete, true)) {
              const before = lib;
              commit(deleteShelf(lib, id, target.id), false);
              go({ name: 'home' }, true);
              offerUndo(t.shelfDeleted(shelf.name), before);
            }
          },
          false,
          'danger'
        )
      )
    );
  });
}
