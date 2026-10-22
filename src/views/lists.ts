/** Lists: library books by status ("Reading", "Wishlist", …) and catalog results by author or subject. */
import { back, catalog, lang, lib, settings, t, type ListFilter } from '../app';
import type { CatalogBook } from '../catalog';
import { filterBooks, seriesBooks, sortBooks, type Book } from '../library';
import { bookRow, previewSheet, resultRow } from '../ui/components';
import { h, iconButton } from '../ui/dom';
import { I } from '../ui/icons';
import type { View } from '../ui/view';
import { errorText } from './add';

export function listView(filter: ListFilter): View {
  const pool =
    filter === 'wishlist' ? filterBooks(lib.books, { owned: false }) : filter === 'lent' ? filterBooks(lib.books, { lent: true }) : filterBooks(lib.books, { status: filter });
  const books = sortBooks(pool, filter === 'toread' || filter === 'wishlist' ? 'added' : settings.sort === 'manual' ? 'author' : settings.sort);
  const title = filter === 'wishlist' ? t.wishlist : filter === 'lent' ? t.lentOut : t.status[filter];
  return listPage(title, books, `list-${filter}`);
}

/** Books with a tag, or the books of a series in reading order. */
export function groupView(kind: 'tag' | 'series', value: string): View {
  const books = kind === 'series' ? seriesBooks(lib.books, value) : sortBooks(filterBooks(lib.books, { tag: value }), 'author');
  return listPage(kind === 'tag' ? `#${value}` : value, books, `group-${kind}-${value}`, kind === 'series');
}

function listPage(title: string, books: Book[], key: string, numbered = false): View {
  const rows = books.map((b) => {
    const row = bookRow(b);
    if (numbered && b.seriesNo !== undefined) row.prepend(h('span', { class: 'series-no' }, String(b.seriesNo).replace('.', lang === 'de' ? ',' : '.')));
    return row;
  });
  return {
    el: h(
      'div',
      { class: 'view' },
      h('header', { class: 'topbar' }, iconButton(I.back, t.back, () => back()), h('h1', { class: 'topbar-title' }, title), h('span', { class: 'topbar-count' }, String(books.length))),
      h('div', { class: 'scroll', dataset: { scroll: key } }, h('div', { class: 'results' }, ...(rows.length ? rows : [h('p', { class: 'empty-note' }, t.noMatches)])))
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
