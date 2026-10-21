/** Reusable pieces: covers, stars, segmented controls, rows, the "add to shelf" sheet, the book form. */
import { addToLibrary, toBookInput, type Placement } from '../actions';
import { catalog, go, lib, settings, shelfName, t } from '../app';
import type { CatalogBook } from '../catalog';
import { largerCover } from '../catalog';
import { textOn } from '../color';
import { spineColor } from '../covers';
import { normalizeIsbn } from '../isbn';
import { findDuplicate, ratingFromX, STATUSES, type Book, type BookInput, type Status } from '../library';
import { h, icon } from './dom';
import { I } from './icons';
import { openSheet, toast } from './overlay';

/* ------------------------------------------------------------------ */
/* Covers                                                             */
/* ------------------------------------------------------------------ */

type CoverLike = { title: string; authors: string[]; coverUrl?: string; spineColor?: string; id?: string };

/** A cover image, or a generated cloth cover with the title if there's no image (or it fails to load). */
export function coverEl(b: CoverLike, cls = '', large = false): HTMLElement {
  const color = spineColor({ title: b.title, id: b.id ?? '', spineColor: b.spineColor });
  const el = h(
    'div',
    { class: `cover ${cls}`, style: `--spine:${color};--spine-ink:${textOn(color)}` },
    h('div', { class: 'cover-gen' }, h('span', { class: 'cover-title' }, b.title), b.authors[0] ? h('span', { class: 'cover-author' }, b.authors[0]) : null)
  );
  if (b.coverUrl) {
    const img = h('img', { src: large ? largerCover(b.coverUrl) : b.coverUrl, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => {
      // the large size may not exist; fall back to the stored size, then to the generated cover
      if (large && img.src !== b.coverUrl) img.src = b.coverUrl!;
      else img.remove();
    });
    img.addEventListener('load', () => {
      // Open Library returns a 1×1 placeholder when it has no cover
      if (img.naturalWidth < 5) img.remove();
      else el.classList.add('has-img');
    });
    el.appendChild(img);
  }
  return el;
}

/* ------------------------------------------------------------------ */
/* Stars                                                              */
/* ------------------------------------------------------------------ */

function starRow(): HTMLElement {
  return h('span', { class: 'star-row' }, ...Array.from({ length: 5 }, () => icon(I.star, 'star')));
}

/** Read-only stars (supports halves). */
export function starsEl(rating: number | undefined, cls = ''): HTMLElement {
  const fill = h('span', { class: 'stars-fill', style: `width:${((rating ?? 0) / 5) * 100}%` }, starRow());
  return h('span', { class: `stars ${cls}`, role: 'img', 'aria-label': rating ? `${rating} / 5` : '' }, starRow(), fill);
}

/** Tap to rate in half stars; tapping the current value again clears it. */
export function ratingInput(value: number | undefined, onChange: (v: number | undefined) => void): HTMLElement {
  let current = value;
  const fill = h('span', { class: 'stars-fill' }, starRow());
  const label = h('span', { class: 'rating-num' });
  const wrap = h('span', { class: 'stars stars-input' }, starRow(), fill);
  const set = (v: number | undefined) => {
    current = v;
    fill.style.width = `${((v ?? 0) / 5) * 100}%`;
    label.textContent = v ? `${String(v).replace('.', lang() === 'de' ? ',' : '.')}` : '–';
  };
  set(value);
  wrap.addEventListener('click', (e) => {
    const r = wrap.getBoundingClientRect();
    const v = ratingFromX(e.clientX - r.left, r.width);
    const next = v === current ? undefined : v;
    set(next);
    onChange(next);
  });
  return h('div', { class: 'rating-input', role: 'slider', 'aria-label': t.rating, 'aria-valuemin': '0', 'aria-valuemax': '5' }, wrap, label);
}

const lang = () => document.documentElement.lang;

/* ------------------------------------------------------------------ */
/* Controls                                                           */
/* ------------------------------------------------------------------ */

export function segmented<T extends string>(options: { value: T; label: string }[], current: T, onChange: (v: T) => void, cls = ''): HTMLElement {
  const el = h('div', { class: `seg ${cls}`, role: 'group' });
  const buttons = options.map((o) =>
    h(
      'button',
      {
        type: 'button',
        'aria-pressed': String(o.value === current),
        onClick: () => {
          buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === o.value)));
          onChange(o.value);
        }
      },
      o.label
    )
  );
  el.append(...buttons);
  return el;
}

export function statusSeg(current: Status, onChange: (s: Status) => void): HTMLElement {
  return segmented(STATUSES.map((s) => ({ value: s, label: t.status[s] })), current, onChange, 'seg-status');
}

export function toggleEl(checked: boolean, label: string, onChange: (v: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', role: 'switch', checked, onChange: () => onChange(input.checked) });
  return h('label', { class: 'toggle' }, h('span', null, label), input, h('span', { class: 'toggle-ui', 'aria-hidden': 'true' }));
}

export function shelfSelect(current: string, onChange: (id: string) => void): HTMLSelectElement {
  const sel = h(
    'select',
    { class: 'select', 'aria-label': t.shelf, onChange: () => onChange(sel.value) },
    ...lib.shelves.map((s) => h('option', { value: s.id, selected: s.id === current }, s.name))
  );
  return sel;
}

/* ------------------------------------------------------------------ */
/* Rows                                                               */
/* ------------------------------------------------------------------ */

export function statusPill(b: Book): HTMLElement {
  const label = b.owned ? t.status[b.status] : `${t.status[b.status]} · ${t.wishlist}`;
  return h('span', { class: `pill pill-${b.status}${b.owned ? '' : ' pill-wish'}` }, label);
}

/** A library book in a list. */
export function bookRow(b: Book, showShelf = true): HTMLElement {
  return h(
    'button',
    { class: 'row', type: 'button', dataset: { book: b.id }, onClick: () => go({ name: 'book', id: b.id }) },
    coverEl(b, 'cover-xs'),
    h(
      'span',
      { class: 'row-main' },
      h('span', { class: 'row-title' }, b.title),
      h('span', { class: 'row-sub' }, [b.authors.join(', '), b.year].filter(Boolean).join(' · ')),
      h('span', { class: 'row-meta' }, statusPill(b), b.rating ? starsEl(b.rating, 'stars-sm') : null, showShelf ? h('span', { class: 'row-shelf' }, shelfName(b.shelfId)) : null)
    ),
    icon(I.chevron, 'icon chev')
  );
}

/** A catalog search result. */
export function resultRow(c: CatalogBook, onPick: (c: CatalogBook) => void): HTMLElement {
  const dup = findDuplicate(lib, c);
  return h(
    'button',
    { class: 'row', type: 'button', onClick: () => onPick(c) },
    coverEl(c, 'cover-xs'),
    h(
      'span',
      { class: 'row-main' },
      h('span', { class: 'row-title' }, c.title, c.subtitle ? h('span', { class: 'row-subtitle' }, ` · ${c.subtitle}`) : null),
      h('span', { class: 'row-sub' }, [c.authors.join(', '), c.year].filter(Boolean).join(' · ')),
      c.snippet ? h('span', { class: 'row-snippet' }, `…${c.snippet}…`) : null,
      dup ? h('span', { class: 'row-meta' }, h('span', { class: 'pill pill-in' }, icon(I.check, 'icon icon-xs'), t.inLibrary)) : null
    ),
    icon(I.plus, 'icon chev')
  );
}

/* ------------------------------------------------------------------ */
/* "Add to shelf" sheet for a catalog result                          */
/* ------------------------------------------------------------------ */

export function defaultPlacement(shelfId?: string, owned?: boolean): Placement {
  const valid = (id?: string) => !!id && lib.shelves.some((s) => s.id === id);
  return {
    shelfId: valid(shelfId) ? shelfId! : valid(settings.lastShelfId) ? settings.lastShelfId : lib.shelves[0].id,
    status: settings.lastStatus,
    owned: owned ?? settings.lastOwned
  };
}

export function placementControls(place: Placement): HTMLElement {
  return h(
    'div',
    { class: 'placement' },
    h('label', { class: 'field' }, h('span', null, t.shelf), shelfSelect(place.shelfId, (id) => (place.shelfId = id))),
    h('div', { class: 'field' }, h('span', null, t.statusLabel), statusSeg(place.status, (s) => (place.status = s))),
    toggleEl(place.owned, t.owned, (v) => (place.owned = v))
  );
}

export function previewSheet(c: CatalogBook, opts: { shelfId?: string; owned?: boolean; onAdded?: (b: Book) => void; onClose?: () => void } = {}): void {
  const place = defaultPlacement(opts.shelfId, opts.owned);
  let added = false;
  openSheet(
    t.addToShelf,
    (body, close) => {
      const desc = h('p', { class: 'desc clamp' }, c.description ?? '');
      if (!c.description) desc.hidden = true;
      const dup = findDuplicate(lib, c);
      body.append(
        h(
          'div',
          { class: 'preview' },
          coverEl(c, 'cover-md'),
          h(
            'div',
            { class: 'preview-main' },
            h('h3', { class: 'preview-title' }, c.title),
            c.subtitle ? h('p', { class: 'preview-subtitle' }, c.subtitle) : null,
            h('p', { class: 'preview-author' }, c.authors.join(', ')),
            h('p', { class: 'muted small' }, [c.year, c.pages ? t.pagesN(c.pages) : null, c.publisher].filter(Boolean).join(' · ')),
            c.isbn ? h('p', { class: 'muted small' }, `ISBN ${c.isbn}`) : null
          )
        ),
        desc,
        dup
          ? h(
              'div',
              { class: 'notice' },
              h('span', null, t.alreadyInLibrary),
              h('button', { class: 'btn small', type: 'button', onClick: () => (close(), go({ name: 'book', id: dup.id })) }, t.open)
            )
          : '',
        placementControls(place),
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
                added = true;
                const book = addToLibrary(toBookInput(c), place);
                close();
                toast(t.added(shelfName(place.shelfId)), { label: t.open, run: () => go({ name: 'book', id: book.id }) });
                opts.onAdded?.(book);
              }
            },
            t.add
          )
        )
      );
      if (!c.description)
        void catalog.details(c).then((d) => {
          if (d.description) {
            c.description = d.description;
            desc.textContent = d.description;
            desc.hidden = false;
          }
          if (!c.subjects.length && d.subjects.length) c.subjects = d.subjects;
        });
    },
    { onClose: () => !added && opts.onClose?.() }
  );
}

/* ------------------------------------------------------------------ */
/* Book details form (manual add and "edit details")                  */
/* ------------------------------------------------------------------ */

export interface BookForm {
  el: HTMLElement;
  /** Validated values, or null (and a message shown) if invalid. */
  read(): BookInput | null;
}

export function bookForm(init: Partial<BookInput> = {}): BookForm {
  const field = (label: string, input: HTMLInputElement, hint?: string) =>
    h('label', { class: 'field' }, h('span', null, label, hint ? h('em', null, ` ${hint}`) : null), input);
  const inp = (value: string | number | undefined, attrs: Record<string, unknown> = {}) =>
    h('input', { class: 'input', type: 'text', value: value === undefined ? '' : String(value), ...attrs });
  const title = inp(init.title, { required: true, autocapitalize: 'sentences' });
  const subtitle = inp(init.subtitle);
  const authors = inp(init.authors?.join(', '), { autocapitalize: 'words' });
  const year = inp(init.year, { inputmode: 'numeric', maxlength: 4 });
  const pages = inp(init.pages, { inputmode: 'numeric', maxlength: 5 });
  const publisher = inp(init.publisher);
  const isbn = inp(init.isbn, { inputmode: 'numeric' });
  const cover = inp(init.coverUrl, { type: 'url', inputmode: 'url', autocapitalize: 'off', spellcheck: false });
  const el = h(
    'div',
    { class: 'book-form' },
    field(t.title, title),
    field(t.subtitle, subtitle, `(${t.optional})`),
    field(t.authors, authors, `(${t.authorsHint})`),
    h('div', { class: 'field-pair' }, field(t.year, year), field(t.pages, pages)),
    field(t.publisher, publisher, `(${t.optional})`),
    field(t.isbn, isbn, `(${t.optional})`),
    field(t.coverUrl, cover, `(${t.optional})`)
  );
  const int = (s: string) => {
    const n = parseInt(s.replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  return {
    el,
    read() {
      const tt = title.value.trim();
      if (!tt) {
        toast(t.titleRequired);
        title.focus();
        return null;
      }
      const isbnRaw = isbn.value.trim();
      const isbnNorm = isbnRaw ? normalizeIsbn(isbnRaw) : undefined;
      if (isbnRaw && !isbnNorm) {
        toast(t.invalidIsbn);
        isbn.focus();
        return null;
      }
      const url = cover.value.trim();
      return {
        title: tt,
        subtitle: subtitle.value.trim() || undefined,
        authors: authors.value
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        year: int(year.value),
        pages: int(pages.value),
        publisher: publisher.value.trim() || undefined,
        isbn: isbnNorm ?? undefined,
        coverUrl: /^https?:\/\//.test(url) ? url : undefined
      };
    }
  };
}
