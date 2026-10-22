/** Add a book: scan the barcode, search a catalog, search by quote, or enter it by hand. */
import { addToLibrary, toBookInput } from '../actions';
import { back, catalog, commit, go, lang, lib, settings, shelfName, t, updateSettings, type AddTab } from '../app';
import { CatalogError, rankCatalog, type CatalogBook } from '../catalog';
import { looksLikeIsbn, normalizeIsbn } from '../isbn';
import type { ScanSession } from '../scanner';
import { findDuplicate, removeBook } from '../library';
import { bookForm, defaultPlacement, placementControls, previewSheet, resultRow, segmented, toggleEl } from '../ui/components';
import { debounce, h, icon, iconButton } from '../ui/dom';
import { I } from '../ui/icons';
import { toast } from '../ui/overlay';
import type { View } from '../ui/view';

/* a short "ding" when a book is added in batch mode (Web Audio; iPhone needs a tap first) */
let audio: AudioContext | null = null;
function beep(unlockOnly = false): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio ??= new AC();
    void audio.resume();
    if (unlockOnly) return;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = 1320;
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.2);
  } catch {
    /* no sound available */
  }
}

/** Remember what was typed when switching tabs or coming back from a book. */
const memo = { search: '', quote: '', searchResults: [] as CatalogBook[], quoteResults: [] as CatalogBook[] };

/** Open the Search tab with a query already typed in (e.g. "Dune 3" from "Find volume 3"). */
export function presetSearch(q: string): void {
  memo.search = q;
  memo.searchResults = [];
}

export function errorText(e: unknown): string {
  if (e instanceof CatalogError && e.kind === 'offline') return t.offline;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return t.offline;
  return t.netError;
}

export function addView(tab: AddTab, shelfId?: string): View {
  const panel = h('div', { class: 'add-panel' });
  let cleanup: (() => void) | undefined;

  const tabs = segmented<AddTab>(
    [
      { value: 'scan', label: t.tabScan },
      { value: 'search', label: t.tabSearch },
      { value: 'quote', label: t.tabQuote },
      { value: 'manual', label: t.tabManual }
    ],
    tab,
    (v) => go({ name: 'add', tab: v, shelfId }, true),
    'seg-tabs'
  );

  const el = h(
    'div',
    { class: 'view view-add' },
    h('header', { class: 'topbar' }, iconButton(I.back, t.back, () => back(shelfId ? { name: 'shelf', id: shelfId } : { name: 'home' })), h('h1', { class: 'topbar-title' }, t.addTitle), h('span', { class: 'topbar-spacer' })),
    h('div', { class: 'tabs-wrap' }, tabs),
    h('div', { class: 'scroll', dataset: { scroll: `add-${tab}` } }, panel)
  );

  let mounted: (() => void) | undefined;
  if (tab === 'scan') ({ cleanup, mounted } = scanPanel(panel, shelfId));
  else if (tab === 'search') ({ mounted } = searchPanel(panel, shelfId));
  else if (tab === 'quote') quotePanel(panel, shelfId);
  else manualPanel(panel, shelfId);

  return { el, cleanup, mounted };
}

/* ------------------------------------------------------------------ */
/* Scan                                                               */
/* ------------------------------------------------------------------ */

function scanPanel(panel: HTMLElement, shelfId?: string): { cleanup: () => void; mounted: () => void } {
  const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
  const status = h('p', { class: 'scan-status' }, t.scanStarting);
  const startBtn = h('button', { class: 'btn primary', type: 'button', hidden: true, onClick: () => start() }, icon(I.camera), t.scanStart);
  const box = h('div', { class: 'scan-box' }, video, h('div', { class: 'scan-guide', 'aria-hidden': 'true' }, h('span', { class: 'scan-line' })), startBtn);
  let session: ScanSession | null = null;
  let alive = true;

  /* ----- batch mode: every scanned book goes straight onto the shelf ----- */
  let batch = settings.batchScan;
  const batchPlace = defaultPlacement(shelfId, true);
  const batchUI = placementControls(batchPlace, { dates: false });
  const batchList = h('div', { class: 'batch-list' });
  const batchCount = h('p', { class: 'muted small batch-count' });
  const batchBox = h('div', { class: 'batch-box' }, h('p', { class: 'muted small' }, t.batchHint), batchUI.el, batchCount, batchList);
  const added: { id: string; title: string }[] = [];
  let lastIsbn = '';
  let lastAt = 0;
  batchBox.hidden = !batch;
  const batchToggle = toggleEl(batch, t.batchMode, (v) => {
    batch = v;
    batchBox.hidden = !v;
    panel.classList.toggle('batch-on', v);
    updateSettings({ batchScan: v }, false);
    beep(true); // unlock sound on iPhone (needs a tap first)
  });

  function batchItem(kind: 'added' | 'dup' | 'missing', title: string, isbn: string, bookId?: string): void {
    const label = kind === 'added' ? t.batchAdded : kind === 'dup' ? t.batchDuplicate : t.batchNotFound;
    const item = h(
      'div',
      { class: `batch-item batch-${kind}` },
      h('span', { class: 'batch-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'batch-text' }, h('b', null, title), h('span', { class: 'muted small' }, `${label} · ${isbn}`)),
      kind === 'added' && bookId
        ? h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              onClick: () => {
                commit(removeBook(lib, bookId), false);
                const i = added.findIndex((a) => a.id === bookId);
                if (i >= 0) added.splice(i, 1);
                item.remove();
                batchCount.textContent = added.length ? t.batchSession(added.length) : '';
              }
            },
            t.removeAgain
          )
        : kind === 'missing'
          ? h('button', { class: 'btn small', type: 'button', onClick: () => manualWith({ isbn }) }, t.addManually)
          : null
    );
    batchList.prepend(item);
  }

  async function batchAdd(isbn: string): Promise<void> {
    // the same barcode is still in front of the camera: ignore it for a moment
    if (isbn === lastIsbn && Date.now() - lastAt < 4000) {
      window.setTimeout(() => session?.resume(), 600);
      return;
    }
    lastIsbn = isbn;
    lastAt = Date.now();
    flash();
    const dup = lib.books.find((b) => b.isbn === isbn);
    if (dup) {
      batchItem('dup', dup.title, isbn);
    } else {
      status.textContent = `${t.scanLooking} ${isbn}`;
      try {
        const book = await catalog.lookupIsbn(isbn);
        if (!alive) return;
        const dup2 = book && findDuplicate(lib, book);
        if (!book) batchItem('missing', `ISBN ${isbn}`, isbn);
        else if (dup2) batchItem('dup', dup2.title, isbn);
        else {
          const b = addToLibrary(toBookInput(book), batchPlace, false);
          added.push({ id: b.id, title: b.title });
          batchItem('added', b.title, isbn, b.id);
          batchCount.textContent = t.batchSession(added.length);
          beep();
        }
        status.textContent = t.scanHint;
      } catch (e) {
        if (!alive) return;
        status.textContent = errorText(e);
        batchItem('missing', errorText(e), isbn);
        lastIsbn = ''; // allow a retry of the same book
      }
    }
    window.setTimeout(() => session?.resume(), 900);
  }

  function flash(): void {
    box.classList.remove('hit');
    void box.offsetWidth;
    box.classList.add('hit');
  }

  const fileInput = h('input', {
    type: 'file',
    accept: 'image/*',
    capture: 'environment',
    hidden: true,
    onChange: async () => {
      const f = fileInput.files?.[0];
      fileInput.value = '';
      if (!f) return;
      status.textContent = t.scanLooking;
      try {
        const { scanImageFile } = await import('../scanner');
        const isbn = await scanImageFile(f);
        if (!isbn) {
          status.textContent = t.scanPhotoNone;
          return;
        }
        await lookup(isbn);
      } catch {
        status.textContent = t.scanPhotoNone;
      }
    }
  });

  const isbnInput = h('input', { class: 'input', type: 'text', inputmode: 'numeric', placeholder: '978…', 'aria-label': t.isbn, enterkeyhint: 'search', autocomplete: 'off' });
  const typed = () => {
    const isbn = normalizeIsbn(isbnInput.value);
    if (!isbn) return toast(t.invalidIsbn);
    isbnInput.blur();
    void lookup(isbn);
  };
  isbnInput.addEventListener('keydown', (e) => e.key === 'Enter' && typed());

  async function lookup(isbn: string): Promise<void> {
    if (batch) return batchAdd(isbn);
    status.textContent = `${t.scanLooking} ${isbn}`;
    try {
      const book = await catalog.lookupIsbn(isbn);
      if (!alive) return;
      if (!book) {
        status.replaceChildren(
          h('span', null, t.notFoundIsbn(isbn), ' '),
          h('button', { class: 'link', type: 'button', onClick: () => manualWith({ isbn }) }, t.addManually)
        );
        session?.resume();
        return;
      }
      status.textContent = t.scanHint;
      // you're holding the book, so it's yours by default
      previewSheet(book, { shelfId, owned: true, onAdded: () => session?.resume(), onClose: () => session?.resume() });
    } catch (e) {
      if (!alive) return;
      status.textContent = errorText(e);
      session?.resume();
    }
  }

  function manualWith(init: { isbn: string }) {
    memoManual = init;
    go({ name: 'add', tab: 'manual', shelfId }, true);
  }

  async function start(): Promise<void> {
    startBtn.hidden = true;
    status.textContent = t.scanStarting;
    const { startScanner } = await import('../scanner');
    if (!alive) return;
    session = await startScanner(
      video,
      (isbn) => void lookup(isbn),
      (err) => {
        status.textContent = err === 'denied' ? t.scanDenied : t.scanNoCamera;
        box.classList.add('off');
        startBtn.hidden = err !== 'other';
      }
    );
    if (!alive) session.stop();
    else if (video.srcObject) status.textContent = t.scanHint;
  }

  panel.classList.toggle('batch-on', batch);
  panel.append(
    h('div', { class: 'batch-toggle' }, batchToggle),
    box,
    status,
    batchBox,
    h('button', { class: 'btn wide', type: 'button', onClick: () => fileInput.click() }, icon(I.camera), t.scanPhoto),
    fileInput,
    h('label', { class: 'field' }, h('span', null, t.typeIsbn), h('div', { class: 'input-row' }, isbnInput, h('button', { class: 'btn', type: 'button', onClick: typed }, t.lookUp)))
  );

  return {
    mounted: () => void start(),
    cleanup: () => {
      alive = false;
      session?.stop();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Search                                                             */
/* ------------------------------------------------------------------ */

function resultsInto(list: HTMLElement, books: CatalogBook[], shelfId?: string, query?: string): void {
  const row = (b: CatalogBook) => resultRow(b, (c) => previewSheet(c, { shelfId, onAdded: () => resultsInto(list, books, shelfId, query) }));
  if (!books.length) return list.replaceChildren(h('p', { class: 'empty-note' }, t.noResults));
  if (!query) return list.replaceChildren(...books.map(row));
  // what matches every typed word first, the rest under "Possible matches"
  const r = rankCatalog(books, query);
  const rest = books.filter((b) => !r.best.includes(b));
  list.replaceChildren(...r.best.map(row), ...(rest.length ? [h('h3', { class: 'results-divider' }, t.possibleMatches), ...rest.map(row)] : []));
}

function searchPanel(panel: HTMLElement, shelfId?: string): { mounted: () => void } {
  const list = h('div', { class: 'results' });
  const hint = h('p', { class: 'muted small' }, t.searchHint);
  let seq = 0;
  const input = h('input', { class: 'input', type: 'search', placeholder: t.searchPlaceholder, value: memo.search, 'aria-label': t.searchPlaceholder, enterkeyhint: 'search', autocomplete: 'off' });

  async function run(): Promise<void> {
    const q = input.value.trim();
    memo.search = input.value;
    const my = ++seq;
    if (q.length < 2) {
      list.replaceChildren();
      memo.searchResults = [];
      hint.hidden = false;
      return;
    }
    hint.hidden = true;
    list.replaceChildren(h('p', { class: 'empty-note' }, t.searching));
    try {
      let res: CatalogBook[];
      if (looksLikeIsbn(q)) {
        const b = await catalog.lookupIsbn(normalizeIsbn(q)!);
        res = b ? [b] : [];
      } else res = await catalog.search(q);
      if (my !== seq) return;
      memo.searchResults = res;
      resultsInto(list, res, shelfId, q);
    } catch (e) {
      if (my !== seq) return;
      list.replaceChildren(h('p', { class: 'empty-note' }, errorText(e)));
    }
  }
  const later = debounce(run, 450);
  input.addEventListener('input', () => later());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      later.cancel();
      input.blur();
      void run();
    }
  });

  panel.append(h('div', { class: 'search search-inline' }, icon(I.search, 'icon search-icon'), input), hint, list);
  if (memo.searchResults.length && memo.search.trim()) {
    hint.hidden = true;
    resultsInto(list, memo.searchResults, shelfId, memo.search);
  }
  return {
    mounted: () => {
      if (!memo.search) input.focus();
      else if (!memo.searchResults.length) void run();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Quote                                                              */
/* ------------------------------------------------------------------ */

function quotePanel(panel: HTMLElement, shelfId?: string): void {
  const list = h('div', { class: 'results' });
  const ta = h('textarea', { class: 'input textarea', rows: 4, placeholder: t.quotePlaceholder, 'aria-label': t.quotePlaceholder });
  ta.value = memo.quote;
  ta.addEventListener('input', () => (memo.quote = ta.value));
  const run = async () => {
    if (ta.value.trim().split(/\s+/).length < 3) return ta.focus();
    ta.blur();
    list.replaceChildren(h('p', { class: 'empty-note' }, t.searching));
    try {
      memo.quoteResults = await catalog.searchQuote(ta.value);
      resultsInto(list, memo.quoteResults, shelfId);
    } catch (e) {
      list.replaceChildren(h('p', { class: 'empty-note' }, errorText(e)));
    }
  };
  panel.append(
    h('p', { class: 'muted small' }, t.quoteHint),
    ta,
    h('button', { class: 'btn primary wide', type: 'button', onClick: run }, icon(I.quote), t.findBook),
    list
  );
  if (memo.quoteResults.length && memo.quote.trim()) resultsInto(list, memo.quoteResults, shelfId);
}

/* ------------------------------------------------------------------ */
/* Manual                                                             */
/* ------------------------------------------------------------------ */

let memoManual: { isbn?: string } = {};

function manualPanel(panel: HTMLElement, shelfId?: string): void {
  const form = bookForm(memoManual);
  memoManual = {};
  const place = defaultPlacement(shelfId);
  const placeUI = placementControls(place);
  panel.append(
    form.el,
    placeUI.el,
    h(
      'button',
      {
        class: 'btn primary wide',
        type: 'button',
        onClick: () => {
          const v = form.read();
          if (!v || !placeUI.valid()) return;
          // hand-entered books are assumed to be in the app's language (affects spine text direction)
          const book = addToLibrary({ ...v, language: lang }, place);
          toast(t.added(shelfName(place.shelfId)));
          go({ name: 'book', id: book.id }, true);
        }
      },
      icon(I.plus),
      t.addToShelf
    )
  );
}
