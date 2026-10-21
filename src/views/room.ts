/**
 * The library room: bookcases standing side by side along a wall, with
 * wall lamps, wainscoting and a wooden floor. Swipe sideways to walk
 * along the wall; tap a bookcase to open that shelf.
 */
import { addShelf, sortBooks, type Shelf } from '../library';
import { commit, go, lib, settings, t, updateSettings } from '../app';
import { fitRows } from '../shelfLayout';
import { bookcaseEl, caseRows } from '../ui/bookcase';
import { h, icon } from '../ui/dom';
import { I } from '../ui/icons';
import { promptSheet } from '../ui/overlay';

let savedScroll = 0;

const MINI_ROW = 92; // target book space per plank in the room, px
const MINI_PLANK = 9; // keep in sync with .bookcase-mini .plank

export function roomEl(): { el: HTMLElement; mounted(): void; cleanup(): void } {
  const track = h('div', { class: 'room-track' });
  const scroller = h('div', { class: 'room-scroll' }, track);
  const el = h('div', { class: 'room' }, scroller);

  function layout(): void {
    const H = el.clientHeight;
    const Wv = el.clientWidth;
    if (!H || !Wv) return;
    const floor = Math.round(Math.min(78, Math.max(48, H * 0.12)));
    const caseW = Math.round(Math.min(280, Math.max(196, Wv * 0.64)));
    const caseH = H - floor * 0.5 - 34;
    el.style.setProperty('--floor', `${floor}px`);
    el.style.setProperty('--case-w', `${caseW}px`);
    el.style.setProperty('--case-h', `${Math.round(caseH)}px`);
    track.style.paddingLeft = track.style.paddingRight = `${Math.max(16, Math.round((Wv - caseW) / 2))}px`;

    const crown = 30;
    const base = 26;
    const posts = 2 * 11;
    const { rows, rowHeight } = fitRows(caseH - crown - base, MINI_ROW + MINI_PLANK, MINI_PLANK, 3);

    const items: HTMLElement[] = [];
    lib.shelves.forEach((s, i) => {
      if (i) items.push(sconce());
      items.push(roomCase(s, caseW - posts, rowHeight, rows));
    });
    items.push(sconce(), newShelfAlcove());
    track.replaceChildren(...items);
    scroller.scrollLeft = savedScroll;
    showSwipeHint();
  }

  // first time only: show that there's more to the right
  let hint: HTMLElement | null = null;
  function showSwipeHint(): void {
    if (settings.swipeHintSeen || hint || scroller.scrollWidth <= scroller.clientWidth + 8 || savedScroll > 0) return;
    hint = h(
      'button',
      {
        class: 'swipe-hint',
        type: 'button',
        onClick: () => scroller.scrollBy({ left: Math.round(el.clientWidth * 0.7), behavior: 'smooth' })
      },
      h('span', null, t.swipeHint),
      icon(I.chevron, 'icon swipe-arrow')
    );
    el.appendChild(hint);
  }
  function hideSwipeHint(): void {
    if (!hint) return;
    updateSettings({ swipeHintSeen: true }, false);
    const old = hint;
    old.classList.add('gone');
    window.setTimeout(() => old.remove(), 300);
  }

  const onScroll = () => {
    savedScroll = scroller.scrollLeft;
    if (hint && !settings.swipeHintSeen && scroller.scrollLeft > 24) hideSwipeHint();
  };
  let timer = 0;
  const onResize = () => {
    clearTimeout(timer);
    timer = window.setTimeout(layout, 120);
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });

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

function roomCase(s: Shelf, inner: number, rowHeight: number, rows: number): HTMLElement {
  const books = sortBooks(lib.books.filter((b) => b.shelfId === s.id), settings.sort);
  const { el, body } = bookcaseEl('bookcase-mini');
  body.append(...caseRows({ books, width: inner, rowHeight, minRows: rows, maxRows: rows, seed: s.id, mini: true }));
  return h(
    'button',
    { class: 'room-case', type: 'button', 'aria-label': `${s.name}, ${t.books(books.length)}`, onClick: () => go({ name: 'shelf', id: s.id }) },
    el,
    h('span', { class: 'room-plate' }, h('span', { class: 'plate-name' }, s.name), h('span', { class: 'plate-count' }, String(books.length)))
  );
}

function sconce(): HTMLElement {
  return h('div', { class: 'sconce', 'aria-hidden': 'true' }, h('span', { class: 'sconce-glow' }), h('span', { class: 'sconce-arm' }), h('span', { class: 'sconce-shade' }));
}

function newShelfAlcove(): HTMLElement {
  return h(
    'button',
    {
      class: 'room-new',
      type: 'button',
      onClick: async () => {
        const name = await promptSheet(t.newShelf, t.shelfName, '', t.add);
        if (name) {
          savedScroll = 1e6; // show the new case at the end
          commit(addShelf(lib, name).lib);
        }
      }
    },
    icon(I.plus),
    h('span', null, t.newShelf)
  );
}
