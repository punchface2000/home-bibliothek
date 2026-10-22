/** The Discover menu: Claude recommendations, a random pick from the to-read pile, stats, sharing the wishlist. */
import { copyText } from '../actions';
import { commit, go, lang, lib, t } from '../app';
import { pickRandom, readNextPool, updateBook, wishlistText, type Book } from '../library';
import { coverEl } from '../ui/components';
import { h, icon } from '../ui/dom';
import { I } from '../ui/icons';
import { openSheet, toast } from '../ui/overlay';
import { askClaudeSheet } from './settings';

export function discoverSheet(): void {
  openSheet(t.discoverTitle, (body, close) => {
    const item = (svg: string, title: string, sub: string, run: () => void) =>
      h('button', { class: 'menu-item menu-item-2', type: 'button', onClick: () => (close(), window.setTimeout(run, 230)) }, h('span', { class: 'help-icon' }, icon(svg)), h('span', { class: 'menu-text' }, h('b', null, title), h('span', { class: 'muted small' }, sub)));
    body.append(
      h(
        'div',
        { class: 'menu' },
        item(I.dice, t.pickNext, t.pickNextSub, pickSheet),
        item(I.sparkle, t.recommendations, t.recommendationsSub, askClaudeSheet),
        item(I.chart, t.statsTitle, t.statsSub, () => go({ name: 'stats' })),
        item(I.share, t.shareWishlist, t.shareWishlistSub, shareWishlist)
      )
    );
  });
}

/* ------------------------------------------------------------------ */
/* What should I read next?                                           */
/* ------------------------------------------------------------------ */

export function pickSheet(): void {
  const pool = readNextPool(lib.books);
  openSheet(t.pickNext, (body, close) => {
    if (!pool.length) {
      body.append(h('p', { class: 'sheet-text' }, t.nothingToPick));
      return;
    }
    const stage = h('div', { class: 'pick-stage' });
    let current: Book | undefined;
    const show = () => {
      current = pickRandom(pool, Math.random, current?.id);
      if (!current) return;
      const b = current;
      const card = h(
        'button',
        { class: 'pick-card', type: 'button', onClick: () => (close(), go({ name: 'book', id: b.id })) },
        coverEl(b, 'cover-md'),
        h('span', { class: 'pick-text' }, h('b', { class: 'preview-title' }, b.title), h('span', null, b.authors.join(', ')), b.pages ? h('span', { class: 'muted small' }, t.pagesN(b.pages)) : null)
      );
      stage.replaceChildren(card);
    };
    show();
    body.append(
      h('p', { class: 'muted small' }, t.pickFrom(pool.length)),
      stage,
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', disabled: pool.length < 2, onClick: show }, icon(I.dice), t.anotherOne),
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onClick: () => {
              if (!current) return;
              commit(updateBook(lib, current.id, { status: 'reading' }), false);
              close();
              go({ name: 'book', id: current.id });
            }
          },
          t.startReading
        )
      )
    );
  });
}

/* ------------------------------------------------------------------ */
/* Share the wishlist                                                 */
/* ------------------------------------------------------------------ */

export async function shareWishlist(): Promise<void> {
  if (!lib.books.some((b) => !b.owned)) {
    toast(t.wishlistEmpty);
    return;
  }
  const text = wishlistText(lib.books, lang);
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try {
      await nav.share({ text, title: t.wishlist });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  toast((await copyText(text)) ? t.copiedPlain : t.copyFailed);
}
