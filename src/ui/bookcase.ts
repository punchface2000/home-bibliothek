/**
 * Draws a bookcase: crown, side posts, back boards, planks, base — with
 * books as spines, bookends and a few ornaments on free space. Used full
 * size on the shelf page and small (no text, not tappable) in the room.
 */
import { textOn } from '../color';
import { spineColor } from '../covers';
import type { Book } from '../library';
import { BOOKEND_W, DECOR_SIZE, packRows, planDecor, rowUsed, spineHeight, spineWidth } from '../shelfLayout';
import { DECOR_SVG } from './decor';
import { h } from './dom';

/** Full-size row height (px of book space per plank). Keep in sync with style.css. */
export const ROW_H = 196;
export const PLANK_H = 15;
const GAP = 1;

export interface CaseOptions {
  books: Book[];
  /** inner width between the side posts, px */
  width: number;
  /** book space per row, px */
  rowHeight: number;
  /** at least this many planks */
  minRows: number;
  /** at most this many planks (extra books are not shown) */
  maxRows?: number;
  seed: string;
  /** small version: no text, not individually tappable */
  mini?: boolean;
  onBook?: (b: Book) => void;
  /** books shown as selected (select mode) */
  selected?: Set<string>;
}

function spineEl(b: Book, scale: number, o: CaseOptions): HTMLElement {
  const color = spineColor(b);
  const w = Math.max(3, Math.round(spineWidth(b) * scale));
  const upward = (b.language ?? '').startsWith('de');
  const style = `--spine:${color};--spine-ink:${textOn(color)};width:${w}px;height:${Math.round(spineHeight(b) * 100)}%`;
  const statusCls = [`st-${b.status}`, b.owned ? '' : 'ghost', b.lentTo ? 'lent' : '', o.selected?.has(b.id) ? 'selected' : ''];
  if (o.mini) return h('span', { class: ['spine', 'mini', ...statusCls].filter(Boolean).join(' '), style, dataset: { book: b.id } }, b.status === 'reading' && !b.lentTo ? h('span', { class: 'ribbon' }) : null);

  const wide = w >= 30;
  const twoLines = w >= 36 && b.title.length > 18;
  // show the author's surname only if title and name both fit on the spine
  const fs = wide ? 12.5 : 11;
  const textPx = spineHeight(b) * (o.rowHeight - 12) - 34;
  const titlePx = (b.title.length * fs * 0.55) / (twoLines ? 2 : 1);
  const surname = b.authors[0]?.split(/\s+/).pop() ?? '';
  const showAuthor = wide && !!surname && titlePx + surname.length * fs * 0.62 + 14 < textPx;
  const cls = ['spine', ...statusCls, upward ? 'up' : '', wide ? 'wide' : '', twoLines ? 'two' : ''].filter(Boolean).join(' ');
  return h(
    'button',
    {
      class: cls,
      type: 'button',
      style,
      dataset: { book: b.id },
      'aria-label': `${b.title}${b.authors[0] ? `, ${b.authors[0]}` : ''}${b.lentTo ? ` (${b.lentTo})` : ''}`,
      'aria-pressed': o.selected ? String(o.selected.has(b.id)) : undefined,
      onClick: () => o.onBook?.(b)
    },
    h('span', { class: 'spine-band top' }),
    h('span', { class: 'spine-text' }, h('span', { class: 'spine-title' }, b.title), showAuthor ? h('span', { class: 'spine-author' }, surname) : null),
    h('span', { class: 'spine-band bottom' }),
    b.status === 'reading' && !b.lentTo ? h('span', { class: 'ribbon', 'aria-hidden': 'true' }) : null,
    // a lent book leaves a gap with a little paper slip saying who has it
    b.lentTo ? h('span', { class: 'lent-slip', 'aria-hidden': 'true' }, b.lentTo) : null,
    o.selected?.has(b.id) ? h('span', { class: 'sel-mark', 'aria-hidden': 'true' }) : null
  );
}

/** The rows of a case (back boards + books + plank), ready to put inside `.case-body`. */
export function caseRows(o: CaseOptions): HTMLElement[] {
  const scale = o.mini ? o.rowHeight / ROW_H : 1;
  const widths = o.books.map((b) => Math.max(3, Math.round(spineWidth(b) * scale)));
  let rows = packRows(widths, o.width, GAP);
  if (o.maxRows !== undefined) rows = rows.slice(0, o.maxRows);
  while (rows.length < o.minRows) rows.push([]);
  const used = rows.map((r) => rowUsed(widths, r, GAP));
  const plan = planDecor(used, o.width, o.rowHeight, o.seed);
  return rows.map((r, i) => {
    const p = plan[i];
    const items: (HTMLElement | null)[] = r.map((k) => spineEl(o.books[k], scale, o));
    if (p.bookend) items.push(h('span', { class: 'bookend', style: `width:${Math.round(BOOKEND_W * o.rowHeight)}px`, 'aria-hidden': 'true' }));
    if (p.decor) {
      const [dw, dh] = DECOR_SIZE[p.decor.kind];
      items.push(
        h('span', {
          class: `decor decor-${p.decor.kind} align-${p.decor.align}`,
          style: `width:${Math.round(dw * o.rowHeight)}px;height:${Math.round(dh * o.rowHeight)}px`,
          html: DECOR_SVG[p.decor.kind],
          'aria-hidden': 'true'
        })
      );
    }
    return h('div', { class: 'shelf-row' }, h('div', { class: 'spine-row', style: `height:${o.rowHeight}px` }, ...items), h('div', { class: 'plank' }));
  });
}

/** A whole bookcase element: crown, body with rows, base. */
export function bookcaseEl(cls = ''): { el: HTMLElement; body: HTMLElement } {
  const body = h('div', { class: 'case-body' });
  const el = h('div', { class: `bookcase ${cls}` }, h('div', { class: 'case-crown', 'aria-hidden': 'true' }), body, h('div', { class: 'case-base', 'aria-hidden': 'true' }));
  return { el, body };
}
