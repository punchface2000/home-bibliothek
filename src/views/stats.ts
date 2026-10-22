/** Reading stats and year in review. */
import { back, go, lang, lib, t } from '../app';
import { libraryStats, yearStats } from '../stats';
import { coverEl, starsEl } from '../ui/components';
import { h, iconButton } from '../ui/dom';
import { I } from '../ui/icons';
import type { View } from '../ui/view';

let selected: number | 'all' | null = null;

const fmt = (n: number) => n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB');

export function statsView(): View {
  const ls = libraryStats(lib.books);
  const thisYear = new Date().getFullYear();
  const years = [...new Set([thisYear, ...ls.perYear.map((y) => y.year)])].sort((a, b) => b - a);
  if (selected === null) selected = ls.perYear.some((y) => y.year === thisYear) ? thisYear : ls.perYear[0]?.year ?? 'all';
  const body = h('div', { class: 'stats' });

  function draw(): void {
    const ys = yearStats(lib.books, selected!);
    const chips = h(
      'div',
      { class: 'chips' },
      ...years.map((y) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(selected === y), onClick: () => ((selected = y), draw()) }, String(y))),
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(selected === 'all'), onClick: () => ((selected = 'all'), draw()) }, t.allTime)
    );

    const tile = (value: string, label: string, sub?: string) => h('div', { class: 'stat-tile' }, h('b', null, value), h('span', null, label), sub ? h('em', null, sub) : null);
    const tiles = h(
      'div',
      { class: 'stat-tiles' },
      tile(fmt(ys.count), t.booksRead),
      tile(fmt(ys.pages), t.pagesRead, ys.pagesUnknown ? t.pagesUnknownNote(ys.pagesUnknown) : undefined),
      tile(ys.avgRating !== undefined ? String(ys.avgRating).replace('.', lang === 'de' ? ',' : '.') : '–', t.avgRating)
    );

    const sections: (HTMLElement | null)[] = [];

    if (!ys.count) sections.push(h('p', { class: 'empty-note' }, t.noReadYet));

    // books per month (single year) or per year (all time)
    if (ys.perMonth && ys.perMonth.some((n) => n > 0)) {
      const max = Math.max(...ys.perMonth);
      sections.push(
        h(
          'section',
          { class: 'card' },
          h('h2', { class: 'card-title' }, t.perMonth),
          h(
            'div',
            { class: 'bars bars-12' },
            ...ys.perMonth.map((n, i) => h('div', { class: 'bar-col', title: `${n}` }, h('span', { class: 'bar-val' }, n ? String(n) : ''), h('span', { class: 'bar', style: `height:${(n / max) * 100}%` }), h('span', { class: 'bar-label' }, t.monthsShort[i])))
          )
        )
      );
    }
    if (selected === 'all' && ls.perYear.length) {
      const list = [...ls.perYear].reverse().slice(-12);
      const max = Math.max(...list.map((y) => y.count));
      sections.push(
        h(
          'section',
          { class: 'card' },
          h('h2', { class: 'card-title' }, t.perYear),
          h(
            'div',
            { class: 'bars' },
            ...list.map((y) =>
              h('button', { class: 'bar-col', type: 'button', onClick: () => ((selected = y.year), draw()) }, h('span', { class: 'bar-val' }, String(y.count)), h('span', { class: 'bar', style: `height:${(y.count / max) * 100}%` }), h('span', { class: 'bar-label' }, `’${String(y.year).slice(2)}`))
            )
          )
        )
      );
    }

    if (ys.topRated.length)
      sections.push(
        h(
          'section',
          { class: 'card' },
          h('h2', { class: 'card-title' }, t.favourites),
          h(
            'div',
            { class: 'fav-strip' },
            ...ys.topRated.map((b) => h('button', { class: 'fav', type: 'button', onClick: () => go({ name: 'book', id: b.id }) }, coverEl(b, 'cover-sm'), starsEl(b.rating, 'stars-sm'), h('span', { class: 'reading-title' }, b.title)))
          )
        )
      );

    if (ys.ratingBuckets.some((n) => n)) {
      const max = Math.max(...ys.ratingBuckets);
      sections.push(
        h(
          'section',
          { class: 'card' },
          h('h2', { class: 'card-title' }, t.ratingsSpread),
          h(
            'div',
            { class: 'hbars' },
            ...[4, 3, 2, 1, 0].map((i) => h('div', { class: 'hbar-row' }, h('span', { class: 'hbar-label' }, `${i + 1}★`), h('span', { class: 'hbar-track' }, h('span', { class: 'hbar', style: `width:${(ys.ratingBuckets[i] / max) * 100}%` })), h('span', { class: 'hbar-val' }, String(ys.ratingBuckets[i]))))
          )
        )
      );
    }

    const facts: HTMLElement[] = [];
    if (ys.longest) facts.push(h('button', { class: 'fact', type: 'button', onClick: () => go({ name: 'book', id: ys.longest!.id }) }, h('span', { class: 'label' }, t.longest), h('b', null, ys.longest.title), h('span', { class: 'muted small' }, t.pagesN(ys.longest.pages!))));
    if (ys.shortest) facts.push(h('button', { class: 'fact', type: 'button', onClick: () => go({ name: 'book', id: ys.shortest!.id }) }, h('span', { class: 'label' }, t.shortest), h('b', null, ys.shortest.title), h('span', { class: 'muted small' }, t.pagesN(ys.shortest.pages!))));
    if (facts.length) sections.push(h('div', { class: 'facts' }, ...facts));

    if (ys.topAuthors.length)
      sections.push(
        h(
          'section',
          { class: 'card' },
          h('h2', { class: 'card-title' }, t.topAuthors),
          h('div', { class: 'menu' }, ...ys.topAuthors.map((a) => h('button', { class: 'menu-item', type: 'button', onClick: () => go({ name: 'find', kind: 'author', value: a.author }) }, h('span', null, a.author), h('b', { class: 'menu-count' }, String(a.count)))))
        )
      );

    sections.push(
      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'card-title' }, t.inLibrary2),
        h(
          'div',
          { class: 'stat-tiles small-tiles' },
          tile(fmt(ls.total), t.books(ls.total).replace(/^\d+\s*/, '')),
          tile(fmt(ls.owned), t.ownedCount),
          tile(fmt(ls.wishlist), t.wishlist),
          tile(fmt(ls.reading), t.status.reading),
          tile(fmt(ls.lent), t.lentOut),
          tile(fmt(ls.pagesToGo), t.pagesToGo)
        )
      )
    );

    if (ls.undated && selected !== 'all') sections.push(h('p', { class: 'muted small stats-note' }, t.undatedNote(ls.undated)));

    body.replaceChildren(chips, tiles, ...sections.filter((x): x is HTMLElement => !!x));
  }
  draw();

  return {
    el: h(
      'div',
      { class: 'view view-stats' },
      h('header', { class: 'topbar' }, iconButton(I.back, t.back, () => back()), h('h1', { class: 'topbar-title' }, t.statsTitle), h('span', { class: 'topbar-spacer' })),
      h('div', { class: 'scroll', dataset: { scroll: 'stats' } }, body)
    )
  };
}
