/** One book: cover, status, rating, notes, quotes, dates, and discovery links. */
import { coverChanged } from '../actions';
import { back, commit, go, lib, render, shelfName, t } from '../app';
import { addQuote, removeBook, removeQuote, updateBook, type Book, type Status } from '../library';
import { bookForm, coverEl, ratingInput, shelfSelect, statusSeg, toggleEl } from '../ui/components';
import { debounce, h, icon, iconButton, todayIso } from '../ui/dom';
import { I } from '../ui/icons';
import { confirmSheet, openSheet, toast } from '../ui/overlay';
import type { View } from '../ui/view';
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

  // dates: filled in automatically when the status changes, editable by hand
  const started = h('input', { class: 'input date', type: 'date', value: book.started ?? '', 'aria-label': t.started, onChange: () => patch({ started: started.value || undefined }) });
  const finished = h('input', { class: 'input date', type: 'date', value: book.finished ?? '', 'aria-label': t.finished, onChange: () => patch({ finished: finished.value || undefined }) });

  const onStatus = (s: Status) => {
    const p: Partial<Book> = { status: s };
    if (s === 'reading' && !b().started) started.value = p.started = todayIso();
    if (s === 'read' && !b().finished) finished.value = p.finished = todayIso();
    patch(p);
  };

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

  const desc = book.description
    ? h('p', { class: 'desc clamp selectable', onClick: () => desc!.classList.toggle('clamp') }, book.description)
    : h('p', { class: 'muted small' }, t.noDescription);

  const meta = [book.year, book.pages ? t.pagesN(book.pages) : null, book.publisher].filter(Boolean).join(' · ');
  const q = (s: string) => encodeURIComponent(s);
  const searchTerm = book.isbn ?? `${book.title} ${book.authors[0] ?? ''}`.trim();
  const links: [string, string][] = [
    ['Google Books', book.infoUrl?.includes('google') ? book.infoUrl : `https://www.google.com/search?tbm=bks&q=${q(searchTerm)}`],
    ['Goodreads', `https://www.goodreads.com/search?q=${q(searchTerm)}`],
    ['Amazon', `https://www.amazon.de/s?k=${q(searchTerm)}&i=stripbooks`],
    [t.library, `https://search.worldcat.org/search?q=${q(book.isbn ? `bn:${book.isbn}` : searchTerm)}`]
  ];
  if (book.infoUrl?.includes('openlibrary')) links.push(['Open Library', book.infoUrl]);

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
          meta ? h('p', { class: 'muted small' }, meta) : null,
          book.isbn ? h('p', { class: 'muted small selectable' }, `ISBN ${book.isbn}`) : null
        )
      ),
      h('section', { class: 'card' }, statusSeg(book.status, onStatus), h('div', { class: 'rating-line' }, h('span', { class: 'label' }, t.rating), ratingInput(book.rating, (v) => patch({ rating: v })))),
      h(
        'section',
        { class: 'card' },
        toggleEl(book.owned, t.owned, (v) => patch({ owned: v })),
        h('label', { class: 'field-inline' }, h('span', null, t.shelf), shelfSelect(book.shelfId, (sid) => patch({ shelfId: sid }))),
        h('div', { class: 'dates' }, h('label', { class: 'field' }, h('span', null, t.started), started), h('label', { class: 'field' }, h('span', null, t.finished), finished))
      ),
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
        h(
          'div',
          { class: 'menu' },
          ...book.authors.slice(0, 2).map((a) => h('button', { class: 'menu-item', type: 'button', onClick: () => go({ name: 'find', kind: 'author', value: a }) }, icon(I.user), h('span', null, t.moreBy(a)))),
          h('button', { class: 'menu-item', type: 'button', onClick: () => askSimilarSheet(b()) }, icon(I.sparkle), h('span', null, t.similarClaude))
        ),
        h('h3', { class: 'card-subtitle' }, t.findOnline),
        h('div', { class: 'link-row' }, ...links.map(([label, href]) => h('a', { class: 'chip', href, target: '_blank', rel: 'noopener' }, label, icon(I.external, 'icon icon-xs'))))
      )
    )
  );

  return {
    el,
    mounted() {
      autosize(remarks);
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
                commit(removeBook(lib, id), false);
                toast(t.deleted);
                back({ name: 'shelf', id: shelfId });
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
