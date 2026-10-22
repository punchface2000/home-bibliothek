/** One book: cover, status, rating, progress, lending, tags, notes, quotes, and discovery links. */
import { coverChanged, enrichBook, myLibraryUrl, offerUndo, setSpineColour } from '../actions';
import { back, commit, go, lang, lib, render, shelfName, t } from '../app';
import { CLOTH, textOn } from '../color';
import { spineColor } from '../covers';
import { formatFlexDate, parseFlexDate, todayFlex } from '../dates';
import { addQuote, allTags, cleanTags, FORMATS, nextInSeries, removeBook, removeQuote, seriesBooks, updateBook, type Book, type Format, type Status } from '../library';
import { bookForm, coverEl, dateRange, ratingInput, shelfSelect, statusSeg, toggleEl } from '../ui/components';
import { debounce, h, icon, iconButton } from '../ui/dom';
import { I } from '../ui/icons';
import { confirmSheet, openSheet } from '../ui/overlay';
import type { View } from '../ui/view';
import { presetSearch } from './add';
import { askSimilarSheet } from './settings';

export function bookView(id: string): View {
  const book = lib.books.find((b) => b.id === id);
  if (!book) {
    window.setTimeout(() => go({ name: 'home' }, true));
    return { el: h('div', { class: 'view' }) };
  }
  const b = (): Book => lib.books.find((x) => x.id === id) ?? book;
  /** save without redrawing (keeps focus and scroll) */
  const patch = (p: Partial<Book>) => commit(updateBook(lib, id, p), false);

  // reading dates: optional, as precise as you remember (2019, 3.2019, 14.3.2019)
  const dates = dateRange({ started: book.started, finished: book.finished }, (v) => patch({ started: v.started, finished: v.finished }));
  dates.showFor('all');

  /* ---------- progress (only while reading) ---------- */
  const progressCard = h('div', { class: 'progress-block' });
  function drawProgress(): void {
    const cur = b();
    progressCard.hidden = cur.status !== 'reading';
    if (progressCard.hidden) return;
    const pageIn = h('input', { class: 'input page-input', type: 'text', inputmode: 'numeric', maxlength: 5, value: cur.currentPage ? String(cur.currentPage) : '', placeholder: '0', 'aria-label': t.page });
    const totalIn = h('input', { class: 'input page-input', type: 'text', inputmode: 'numeric', maxlength: 5, value: cur.pages ? String(cur.pages) : '', placeholder: '?', 'aria-label': t.setPages });
    const pct = cur.pages && cur.currentPage ? Math.min(100, Math.round((cur.currentPage / cur.pages) * 100)) : 0;
    const bar = h('div', { class: 'progress-bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span', { style: `width:${pct}%` }));
    const save = () => {
      const p = parseInt(pageIn.value, 10);
      const total = parseInt(totalIn.value, 10);
      patch({
        currentPage: Number.isFinite(p) && p > 0 ? Math.min(p, Number.isFinite(total) && total > 0 ? total : p) : undefined,
        ...(Number.isFinite(total) && total > 0 ? { pages: total } : {})
      });
      drawProgress();
    };
    pageIn.addEventListener('change', save);
    totalIn.addEventListener('change', save);
    for (const i of [pageIn, totalIn]) i.addEventListener('keydown', (e) => e.key === 'Enter' && i.blur());
    const left = cur.pages && cur.currentPage ? Math.max(0, cur.pages - cur.currentPage) : null;
    progressCard.replaceChildren(
      h('div', { class: 'progress-line' }, h('span', { class: 'label' }, t.progress), h('span', { class: 'progress-inputs' }, h('span', null, t.page), pageIn, h('span', null, t.ofWord), totalIn)),
      bar,
      h('p', { class: 'muted small' }, left !== null ? `${t.percentDone(pct)} · ${t.pagesLeft(left)}` : '')
    );
  }
  drawProgress();
  const onStatus = (s: Status) => {
    patch({ status: s });
    drawProgress();
  };

  /* ---------- lending ---------- */
  const lendBlock = h('div', { class: 'lend-block' });
  function drawLending(): void {
    const cur = b();
    if (cur.lentTo) {
      lendBlock.replaceChildren(
        h(
          'div',
          { class: 'lent-card' },
          icon(I.handover, 'icon lent-icon'),
          h('span', { class: 'lent-text' }, h('b', null, t.lentTo(cur.lentTo)), cur.lentSince ? h('span', { class: 'muted small' }, `${t.lentSinceLabel} ${formatFlexDate(cur.lentSince, lang)}`) : null),
          h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              onClick: () => {
                patch({ lentTo: undefined, lentSince: undefined });
                drawLending();
              }
            },
            t.returned
          )
        )
      );
    } else {
      lendBlock.replaceChildren(h('button', { class: 'btn small wide-left', type: 'button', onClick: () => lendSheet(id, drawLending) }, icon(I.handover), t.lendBook));
    }
  }
  drawLending();

  /* ---------- tags ---------- */
  const tagsEl = h('div', { class: 'chips chips-wrap tag-chips' });
  function drawTags(): void {
    const cur = b();
    tagsEl.replaceChildren(
      ...cur.tags.map((tag) =>
        h(
          'span',
          { class: 'chip tag-chip' },
          h('button', { class: 'tag-name', type: 'button', onClick: () => go({ name: 'group', kind: 'tag', value: tag }) }, `#${tag}`),
          h(
            'button',
            {
              class: 'tag-x',
              type: 'button',
              'aria-label': `${t.delete} ${tag}`,
              onClick: () => {
                patch({ tags: b().tags.filter((x) => x !== tag) });
                drawTags();
              }
            },
            icon(I.close, 'icon icon-xs')
          )
        )
      ),
      h('button', { class: 'chip chip-add', type: 'button', onClick: () => tagSheet(id, drawTags) }, icon(I.plus, 'icon icon-xs'), t.addTag)
    );
  }
  drawTags();

  /* ---------- notes ---------- */
  const saveRemarks = debounce((v: string) => patch({ remarks: v }), 400);
  const remarks = h('textarea', {
    class: 'input textarea',
    rows: 3,
    placeholder: t.remarksPlaceholder,
    'aria-label': t.remarks,
    onInput: () => {
      autosize(remarks);
      saveRemarks(remarks.value);
    },
    onBlur: () => saveRemarks.flush()
  });
  remarks.value = book.remarks;

  /* ---------- quotes ---------- */
  const quotesEl = h('div', { class: 'quotes' });
  const drawQuotes = () =>
    quotesEl.replaceChildren(
      ...b().quotes.map((q) =>
        h(
          'figure',
          { class: 'quote' },
          h('blockquote', { class: 'selectable' }, q.text),
          h(
            'figcaption',
            null,
            q.page ? `${t.page} ${q.page}` : '',
            iconButton(I.trash, t.delete, async () => {
              if (await confirmSheet(t.delete, `“${q.text.slice(0, 80)}${q.text.length > 80 ? '…' : ''}”`, t.delete, true)) {
                commit(removeQuote(lib, id, q.id), false);
                drawQuotes();
              }
            }, 'icon-btn icon-btn-sm')
          )
        )
      )
    );
  drawQuotes();

  /* ---------- spine colour ---------- */
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': t.spineColour });
  function drawSwatches(): void {
    const cur = b();
    const current = cur.spineManual ? cur.spineColor : null;
    const auto = h(
      'button',
      { class: 'swatch swatch-auto', type: 'button', role: 'radio', 'aria-checked': String(!current), title: t.spineAuto, onClick: () => (setSpineColour(id, null), window.setTimeout(drawSwatches, 50)) },
      h('span', { style: `background:${cur.spineManual ? '#888' : spineColor(cur)}` }),
      t.spineAuto
    );
    swatches.replaceChildren(
      auto,
      ...CLOTH.map((c) =>
        h('button', {
          class: 'swatch',
          type: 'button',
          role: 'radio',
          'aria-checked': String(current === c),
          'aria-label': c,
          style: `--sw:${c};--sw-ink:${textOn(c)}`,
          onClick: () => {
            setSpineColour(id, c);
            drawSwatches();
          }
        })
      )
    );
  }
  drawSwatches();

  /* ---------- description, series, links ---------- */
  const desc = book.description
    ? h('p', { class: 'desc clamp selectable', onClick: () => desc!.classList.toggle('clamp') }, book.description)
    : h('p', { class: 'muted small' }, t.noDescription);

  const meta = [book.year, book.pages ? t.pagesN(book.pages) : null, book.format ? t.formats[book.format] : null, book.publisher].filter(Boolean).join(' · ');
  const q = (s: string) => encodeURIComponent(s);
  const searchTerm = book.isbn ?? `${book.title} ${book.authors[0] ?? ''}`.trim();
  const titleAuthor = `${book.title} ${book.authors[0] ?? ''}`.trim();
  const links: [string, string][] = [
    ['Google Books', book.infoUrl?.includes('google') ? book.infoUrl : `https://www.google.com/search?tbm=bks&q=${q(searchTerm)}`],
    ['Goodreads', `https://www.goodreads.com/search?q=${q(searchTerm)}`],
    ['Amazon', `https://www.amazon.de/s?k=${q(searchTerm)}&i=stripbooks`]
  ];
  if (book.infoUrl?.includes('openlibrary')) links.push(['Open Library', book.infoUrl]);
  const borrow: [string, string][] = [
    [t.onleihe, `https://www.google.com/search?q=${q(`onleihe ${titleAuthor}`)}`],
    ['WorldCat', `https://search.worldcat.org/search?q=${q(book.isbn ? `bn:${book.isbn}` : searchTerm)}`]
  ];
  const mine = myLibraryUrl(book);
  if (mine) borrow.unshift([t.myLibrary, mine]);
  const linkChips = (list: [string, string][]) => h('div', { class: 'link-row' }, ...list.map(([label, href]) => h('a', { class: 'chip', href, target: '_blank', rel: 'noopener' }, label, icon(I.external, 'icon icon-xs'))));

  let seriesBlock: HTMLElement | null = null;
  if (book.series) {
    const count = seriesBooks(lib.books, book.series).length;
    const next = nextInSeries(lib.books, book);
    seriesBlock = h(
      'div',
      { class: 'menu' },
      h('button', { class: 'menu-item', type: 'button', onClick: () => go({ name: 'group', kind: 'series', value: book.series! }) }, icon(I.spines), h('span', null, `${book.series} · ${t.inSeries(count)}`)),
      next?.book
        ? h('button', { class: 'menu-item', type: 'button', onClick: () => go({ name: 'book', id: next.book!.id }) }, icon(I.chevron), h('span', null, `${t.nextInSeries}: ${next.book.title}`))
        : next
          ? h(
              'button',
              {
                class: 'menu-item',
                type: 'button',
                onClick: () => {
                  presetSearch(`${book.series} ${next.no}`);
                  go({ name: 'add', tab: 'search', shelfId: book.shelfId });
                }
              },
              icon(I.search),
              h('span', null, t.findVolume(next.no))
            )
          : null
    );
  }

  const formatSel = h(
    'select',
    {
      class: 'select',
      'aria-label': t.format,
      onChange: () => {
        patch({ format: (formatSel.value || undefined) as Format | undefined });
      }
    },
    h('option', { value: '', selected: !book.format }, t.formatNone),
    ...FORMATS.map((f) => h('option', { value: f, selected: book.format === f }, t.formats[f]))
  );

  const el = h(
    'div',
    { class: 'view view-book' },
    h(
      'header',
      { class: 'topbar' },
      iconButton(I.back, t.back, () => back({ name: 'shelf', id: book.shelfId })),
      h('span', { class: 'topbar-title small' }, shelfName(book.shelfId)),
      h('div', { class: 'topbar-actions' }, iconButton(I.more, t.edit, () => bookMenu(id)))
    ),
    h(
      'div',
      { class: 'scroll', dataset: { scroll: `book-${id}` } },
      h(
        'section',
        { class: 'book-head' },
        coverEl(book, 'cover-lg', true),
        h(
          'div',
          { class: 'book-head-main' },
          h('h1', { class: 'book-title selectable' }, book.title),
          book.subtitle ? h('p', { class: 'book-subtitle selectable' }, book.subtitle) : null,
          h(
            'p',
            { class: 'book-authors' },
            ...book.authors.flatMap((a, i) => [i ? ', ' : '', h('button', { class: 'link', type: 'button', onClick: () => go({ name: 'find', kind: 'author', value: a }) }, a)])
          ),
          book.series ? h('button', { class: 'series-pill', type: 'button', onClick: () => go({ name: 'group', kind: 'series', value: book.series! }) }, t.seriesLabel(book.series, book.seriesNo)) : null,
          meta ? h('p', { class: 'muted small' }, meta) : null,
          book.isbn ? h('p', { class: 'muted small selectable' }, `ISBN ${book.isbn}`) : null
        )
      ),
      h('section', { class: 'card' }, statusSeg(book.status, onStatus), progressCard, h('div', { class: 'rating-line' }, h('span', { class: 'label' }, t.rating), ratingInput(book.rating, (v) => patch({ rating: v })))),
      h(
        'section',
        { class: 'card' },
        toggleEl(book.owned, t.owned, (v) => patch({ owned: v })),
        h('label', { class: 'field-inline' }, h('span', null, t.shelf), shelfSelect(book.shelfId, (sid) => patch({ shelfId: sid, order: undefined }))),
        h('label', { class: 'field-inline' }, h('span', null, t.format), formatSel),
        dates.el,
        lendBlock
      ),
      h('section', { class: 'card' }, h('h2', { class: 'card-title' }, t.tags), tagsEl),
      h('section', { class: 'card' }, h('h2', { class: 'card-title' }, t.remarks), remarks),
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'card-title-row' }, h('h2', { class: 'card-title' }, t.quotes), h('button', { class: 'btn small', type: 'button', onClick: () => quoteSheet(id, drawQuotes) }, icon(I.plus), t.addQuote)),
        quotesEl
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'card-title' }, t.about),
        desc,
        book.subjects.length
          ? h('div', { class: 'chips chips-wrap' }, ...book.subjects.map((s) => h('button', { class: 'chip', type: 'button', onClick: () => go({ name: 'find', kind: 'subject', value: s }) }, s)))
          : null
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'card-title' }, t.discover),
        seriesBlock,
        h(
          'div',
          { class: 'menu' },
          ...book.authors.slice(0, 2).map((a) => h('button', { class: 'menu-item', type: 'button', onClick: () => go({ name: 'find', kind: 'author', value: a }) }, icon(I.user), h('span', null, t.moreBy(a)))),
          h('button', { class: 'menu-item', type: 'button', onClick: () => askSimilarSheet(b()) }, icon(I.sparkle), h('span', null, t.similarClaude))
        ),
        h('h3', { class: 'card-subtitle' }, t.borrowIt),
        linkChips(borrow),
        h('h3', { class: 'card-subtitle' }, t.findOnline),
        linkChips(links)
      ),
      h('section', { class: 'card' }, h('h2', { class: 'card-title' }, t.spineColour), swatches)
    )
  );

  return {
    el,
    mounted() {
      autosize(remarks);
      // imported books: fill in cover, description etc. once, if online
      void enrichBook(id, () => {
        const a = document.activeElement;
        if (!a || !(a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement)) render();
      });
    },
    cleanup() {
      saveRemarks.flush();
    }
  };
}

function autosize(ta: HTMLTextAreaElement): void {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight + 2, 400)}px`;
}

function lendSheet(id: string, redraw: () => void): void {
  openSheet(t.lendBook, (body, close) => {
    const known = [...new Set(lib.books.map((x) => x.lentTo).filter((x): x is string => !!x))];
    const listId = 'borrowers';
    const name = h('input', { class: 'input', type: 'text', placeholder: t.borrowerPlaceholder, 'aria-label': t.borrower, list: listId, autocapitalize: 'words', maxlength: 40 });
    const since = h('input', { class: 'input', type: 'text', inputmode: 'decimal', value: formatFlexDate(todayFlex(), lang), 'aria-label': t.lentSinceLabel, placeholder: t.datePlaceholder });
    const msg = h('p', { class: 'date-msg' });
    const save = () => {
      const who = name.value.trim();
      if (!who) return name.focus();
      const d = parseFlexDate(since.value);
      if (d === null) {
        msg.textContent = t.dateInvalid;
        since.classList.add('bad');
        return;
      }
      commit(updateBook(lib, id, { lentTo: who, lentSince: d || undefined }), false);
      redraw();
      close();
    };
    name.addEventListener('keydown', (e) => e.key === 'Enter' && save());
    body.append(
      h('label', { class: 'field' }, h('span', null, t.borrower), name),
      h('datalist', { id: listId }, ...known.map((n) => h('option', { value: n }))),
      h('label', { class: 'field' }, h('span', null, `${t.lentSinceLabel} (${t.optional})`), since),
      msg,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onClick: () => close() }, t.cancel), h('button', { class: 'btn primary', type: 'button', onClick: save }, t.lend))
    );
    window.setTimeout(() => name.focus(), 250);
  });
}

function tagSheet(id: string, redraw: () => void): void {
  openSheet(t.addTag, (body, close) => {
    const cur = lib.books.find((x) => x.id === id)!;
    const has = new Set(cur.tags.map((x) => x.toLowerCase()));
    const input = h('input', { class: 'input', type: 'text', placeholder: t.tagPlaceholder, 'aria-label': t.addTag, autocapitalize: 'none', maxlength: 40, enterkeyhint: 'done' });
    const add = (tags: string[]) => {
      const now = lib.books.find((x) => x.id === id)!;
      commit(updateBook(lib, id, { tags: cleanTags([...now.tags, ...tags]) }), false);
      redraw();
      close();
    };
    const submit = () => {
      // several at once: "signed, gift"
      const tags = input.value.split(',').map((x) => x.trim().replace(/^#/, '')).filter(Boolean);
      if (!tags.length) return input.focus();
      add(tags);
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    const suggestions = allTags(lib.books).filter((x) => !has.has(x.tag.toLowerCase())).slice(0, 12);
    body.append(
      h('div', { class: 'input-row' }, input, h('button', { class: 'btn primary', type: 'button', onClick: submit }, t.add)),
      suggestions.length ? h('div', { class: 'chips chips-wrap' }, ...suggestions.map((s) => h('button', { class: 'chip', type: 'button', onClick: () => add([s.tag]) }, `#${s.tag}`, h('b', null, String(s.count))))) : ''
    );
    window.setTimeout(() => input.focus(), 250);
  });
}

function quoteSheet(id: string, redraw: () => void): void {
  openSheet(t.addQuote, (body, close) => {
    const text = h('textarea', { class: 'input textarea', rows: 4, placeholder: t.quoteText, 'aria-label': t.quoteText });
    const page = h('input', { class: 'input', type: 'text', inputmode: 'numeric', 'aria-label': t.page, maxlength: 10 });
    body.append(
      h('label', { class: 'field' }, h('span', null, t.quoteText), text),
      h('label', { class: 'field field-short' }, h('span', null, `${t.page} (${t.optional})`), page),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onClick: () => close() }, t.cancel),
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onClick: () => {
              if (!text.value.trim()) return text.focus();
              commit(addQuote(lib, id, text.value, page.value), false);
              redraw();
              close();
            }
          },
          t.save
        )
      )
    );
    window.setTimeout(() => text.focus(), 250);
  });
}

function bookMenu(id: string): void {
  const b = lib.books.find((x) => x.id === id)!;
  openSheet(b.title, (body, close) => {
    body.append(
      h(
        'div',
        { class: 'menu' },
        h('button', { class: 'menu-item', type: 'button', onClick: () => (close(), editSheet(id)) }, icon(I.pen), h('span', null, t.editDetails)),
        h(
          'button',
          {
            class: 'menu-item danger',
            type: 'button',
            onClick: async () => {
              close();
              if (await confirmSheet(t.deleteBook, t.deleteBookConfirm(b.title), t.delete, true)) {
                const shelfId = b.shelfId;
                const before = lib;
                commit(removeBook(lib, id), false);
                back({ name: 'shelf', id: shelfId });
                offerUndo(t.booksDeleted(1), before);
              }
            }
          },
          icon(I.trash),
          h('span', null, t.deleteBook)
        )
      )
    );
  });
}

function editSheet(id: string): void {
  const b = lib.books.find((x) => x.id === id)!;
  openSheet(
    t.editDetails,
    (body, close) => {
      const form = bookForm(b);
      body.append(
        form.el,
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', onClick: () => close() }, t.cancel),
          h(
            'button',
            {
              class: 'btn primary',
              type: 'button',
              onClick: () => {
                const v = form.read();
                if (!v) return;
                const coverDiff = v.coverUrl !== b.coverUrl;
                commit(updateBook(lib, id, v), false);
                if (coverDiff) coverChanged(id, v.coverUrl);
                close();
                render();
              }
            },
            t.save
          )
        )
      );
    },
    { wide: true }
  );
}

