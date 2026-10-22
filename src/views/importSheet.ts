/** Import a Goodreads or StoryGraph export (CSV) into a shelf. */
import { backfillSpineColors } from '../actions';
import { commit, lib, t } from '../app';
import { readReadingExport, type ImportedBook } from '../importCsv';
import { addBook, findDuplicate } from '../library';
import { segmented, shelfSelect } from '../ui/components';
import { h, icon } from '../ui/dom';
import { I } from '../ui/icons';
import { openSheet, toast } from '../ui/overlay';

type OwnedMode = 'all' | 'file' | 'none';

export async function importReadingFile(file: File): Promise<void> {
  const parsed = readReadingExport(await file.text());
  if (!parsed) {
    toast(t.importBadFile);
    return;
  }
  const fresh = parsed.books.filter((b) => !findDuplicate(lib, b));
  const dupes = parsed.books.length - fresh.length;
  if (!fresh.length) {
    toast(t.importNothing);
    return;
  }
  const source = parsed.source === 'goodreads' ? 'Goodreads' : 'StoryGraph';
  let shelfId = lib.shelves[0].id;
  // Goodreads' "Owned Copies" is usually 0 for everyone; only trust it if the file uses it
  let owned: OwnedMode = parsed.hasOwnership ? 'file' : 'all';

  openSheet(t.importTitle, (body, close) => {
    const opts: { value: OwnedMode; label: string }[] = [{ value: 'all', label: t.ownedAll }];
    if (parsed.hasOwnership) opts.push({ value: 'file', label: t.ownedFile });
    opts.push({ value: 'none', label: t.ownedNone });
    body.append(
      h('p', { class: 'sheet-text' }, t.importFound(parsed.books.length, source), ' ', t.importNew(fresh.length, dupes)),
      h('label', { class: 'field' }, h('span', null, t.shelf), shelfSelect(shelfId, (id) => (shelfId = id))),
      h('div', { class: 'field' }, h('span', null, t.importOwned), segmented<OwnedMode>(opts, owned, (v) => (owned = v))),
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
              let next = lib;
              const now = Date.now();
              fresh.forEach((b, i) => (next = addBook(next, toInput(b, shelfId, owned), now + i).lib));
              commit(next);
              close();
              toast(t.importDone(fresh.length));
              void backfillSpineColors();
            }
          },
          icon(I.upload),
          t.importBtn(fresh.length)
        )
      )
    );
  });
}

function toInput(b: ImportedBook, shelfId: string, mode: OwnedMode) {
  const { ownedInFile, ...rest } = b;
  return {
    ...rest,
    shelfId,
    owned: mode === 'all' ? true : mode === 'none' ? false : ownedInFile === true,
    // Open Library has covers for most ISBNs; if not, the generated cloth cover is shown
    coverUrl: b.isbn ? `https://covers.openlibrary.org/b/isbn/${b.isbn}-M.jpg?default=false` : undefined
  };
}
