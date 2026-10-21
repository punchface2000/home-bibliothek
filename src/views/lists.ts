/** Lists: library books by status ("Reading", "Wishlist", …) and catalog results by author or subject. */
import { back, catalog, lib, settings, t, type ListFilter } from '../app';
import type { CatalogBook } from '../catalog';
import { filterBooks, sortBooks } from '../library';
import { bookRow, previewSheet, resultRow } from '../ui/components';
import { h, iconButton } from '../ui/dom';
import { I } from '../ui/icons';
import type { View } from '../ui/view';
import { errorText } from './add';

export function listView(filter: ListFilter): View {
  const books = sortBooks(filter === 'wishlist' ? filterBooks(lib.books, { owned: false }) : filterBooks(lib.books, { status: filter }), filter === 'toread' || filter === 'wishlist' ? 'added' : settings.sort);
  const title = filter === 'wishlist' ? t.wishlist : t.status[filter];
  return {
    el: h(
      'div',
      { class: 'view' },
      h('header', { class: 'topbar' }, iconButton(I.back, t.back, () => back()), h('h1', { class: 'topbar-title' }, title), h('span', { class: 'topbar-count' }, String(books.length))),
      h('div', { class: 'scroll', dataset: { scroll: `list-${filter}` } }, h('div', { class: 'results' }, ...(books.length ? books.map((b) => bookRow(b)) : [h('p', { class: 'empty-note' }, t.noMatches)])))
    )
  };
}

const cache = new Map<string, CatalogBook[]>();

export function findView(kind: 'author' | 'subject', value: string): View {
  const key = `${kind}:${value}`;
  const list = h('div', { class: 'results' });
  const draw = (res: CatalogBook[]) => list.replaceChildren(...(res.length ? res.map((b) => resultRow(b, (c) => previewSheet(c, { owned: false, onAdded: () => draw(res) }))) : [h('p', { class: 'empty-note' }, t.noResults)]));
  const cached = cache.get(key);
  if (cached) draw(cached);
  else {
    list.append(h('p', { class: 'empty-note' }, t.searching));
    (kind === 'author' ? catalog.byAuthor(value) : catalog.bySubject(value))
      .then((res) => {
        cache.set(key, res);
        draw(res);
      })
      .catch((e) => list.replaceChildren(h('p', { class: 'empty-note' }, errorText(e))));
  }
  return {
    el: h(
      'div',
      { class: 'view' },
      h('header', { class: 'topbar' }, iconButton(I.back, t.back, () => back()), h('h1', { class: 'topbar-title' }, kind === 'author' ? t.byAuthor(value) : t.bySubject(value)), h('span', { class: 'topbar-spacer' })),
      h('div', { class: 'scroll', dataset: { scroll: `find-${key}` } }, list)
    )
  };
}
