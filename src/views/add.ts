/** Add a book: scan the barcode, search a catalog, search by quote, or enter it by hand. */
import { addToLibrary } from '../actions';
import { back, catalog, go, lang, shelfName, t, type AddTab } from '../app';
import { CatalogError, type CatalogBook } from '../catalog';
import { looksLikeIsbn, normalizeIsbn } from '../isbn';
import type { ScanSession } from '../scanner';
import { bookForm, defaultPlacement, placementControls, previewSheet, resultRow, segmented } from '../ui/components';
import { debounce, h, icon, iconButton } from '../ui/dom';
import { I } from '../ui/icons';
import { toast } from '../ui/overlay';
import type { View } from '../ui/view';

/** Remember what was typed when switching tabs or coming back from a book. */
const memo = { search: '', quote: '', searchResults: [] as CatalogBook[], quoteResults: [] as CatalogBook[] };

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

  panel.append(
    box,
    status,
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

function resultsInto(list: HTMLElement, books: CatalogBook[], shelfId?: string): void {
  list.replaceChildren(...(books.length ? books.map((b) => resultRow(b, (c) => previewSheet(c, { shelfId, onAdded: () => resultsInto(list, books, shelfId) }))) : [h('p', { class: 'empty-note' }, t.noResults)]));
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
      resultsInto(list, res, shelfId);
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
    resultsInto(list, memo.searchResults, shelfId);
  }
  return { mounted: () => !memo.search && input.focus() };
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
  panel.append(
    form.el,
    placementControls(place),
    h(
      'button',
      {
        class: 'btn primary wide',
        type: 'button',
        onClick: () => {
          const v = form.read();
          if (!v) return;
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
