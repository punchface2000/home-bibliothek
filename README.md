# Home Library

Your bookshelves at home, on your phone: what you own, what you've read, what you want to read, your ratings, notes and favourite quotes. English and German.

**Live:** https://punchface2000.github.io/home-bibliothek/

## Install on iPhone

1. Open the link above in **Safari**.
2. Tap **Share** → **Add to Home Screen**.
3. Open it from the home screen. After the first load it works offline (adding books needs internet).

To get a new version: open the app while online (sometimes twice).

## How to use

- **Library (home):** a library room — your bookcases stand along a wall with lamps and a wooden floor; swipe sideways to walk along, tap a bookcase to open it, the dashed alcove at the end adds a shelf. The button top-right switches to a compact card view and back. The chips (Reading, To read, Read, Wishlist) list books by status. The search box searches your own library: title and author together in any order (`mann zauberberg`), forgiving small typos (`Tolstoy` finds Tolstoi) and unfinished words; when not every word fits it shows "possible matches". It also searches ISBN, series, tags, notes and quotes.
- **Shelf:** a full bookcase (crown, planks filling the screen, plinth) with books as spines; free space gets bookends and the odd ornament (globe, plant, clock…), so even an empty shelf looks like real furniture. Spine colour comes from the cover (or pick one on the book card), thickness from the page count; a red ribbon marks books you're reading, dashed spines are wishlist books you don't own, a gap with a paper slip is a book you've lent out. Ebooks and audiobooks sit in a "Digital" section under the bookcase. German books read bottom-to-top, English ones top-to-bottom. Filter chips by status, lending and #tags. Top-right: covers/spines view, sort (each shelf remembers its own, including **My order**), and the shelf menu: **Select books** (move or delete several), **Arrange books** (drag spines into the order of your real shelf), rename, move, delete.
- **Book:** status, reading progress (page x of y) while reading, half-star rating (tap the same star again to clear), "I own this", shelf, format (paperback, hardcover, eBook, audiobook), optional start/finish dates (a year `2019`, month and year `3.2019`, or a full date `14.3.2019`; a "Today" shortcut next to each), **lending** (who has it, since when), **#tags**, **series** and volume (with "next in series"), notes, quotes, description, "More by …", subject chips, spine colour, borrow links (Onleihe, WorldCat, and your own library once set up in Settings) and shop links. Imported books fill in their cover and description the first time you open them online.
- **Add (+):**
  - **Scan**: point the camera at the barcode on the back of the book. If the camera isn't available, take a photo of the barcode or type the ISBN. Turn on **Scan many in a row** to add each scanned book straight onto a shelf (with a ding and a list you can undo from).
  - **Search**: title, author or both, or ISBN (Google Books + Open Library); results matching every word come first, the rest under "Possible matches".
  - **Quote**: paste a sentence from a book; Google Books' full-text search finds which book it's from.
  - **Manual**: for books that aren't in any catalogue.
- **Discover (✦):** *What should I read next?* (a random pick from your to-read pile), *Recommendations from Claude* (copies a summary of your library and opens Claude — no API key, nothing sent from the app itself), *Reading stats* (year in review: books and pages per year and month, favourites, ratings, most-read authors, longest and shortest), *Share wishlist* (as a text list).
- **Undo:** deleting books or a shelf, or moving books, shows an "Undo" button for a few seconds.
- **Help (?):** a short guide to every feature, and the welcome cards again. The welcome shows once on first launch; the room shows a one-time "swipe for more" hint; a backup reminder appears when you have more than 10 books and no backup in 30 days ("Later" snoozes it for 2 weeks).
- **Settings (⚙):** theme (auto/light/dark), language (auto/English/Deutsch), **backup export/import**, **import from Goodreads or StoryGraph** (their CSV export: status, ratings, dates, series, formats, shelves become tags; books already in your library are skipped), and **your library's catalogue** (search your library's website for the word XYZZY, paste the results address — every book card then gets a "My library" button).

**Backups:** your library lives only on this device (browser storage). Export a backup now and then (on iPhone: Share → Save to Files). Importing merges a backup into the current library (newer edits win, nothing is deleted), which is also how to move your library to another device.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests (Vitest)
npm run build    # type-check + production build into dist/
npm run icons    # regenerate PNG icons from public/favicon.svg
```

Pushing to `main` runs the tests, builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Files

```
src/
  shelfLayout.ts spine sizes, packing books onto planks, bookends & ornaments (pure, tested)
  library.ts     books & shelves model: search, sorting (incl. series, my order), filters, lending,
                 tags, series, several books at once, random pick, wishlist text, prompts (pure, tested)
  search.ts      forgiving search: typos, word starts, ranking, possible matches (pure, tested)
  stats.ts       reading stats and year in review (pure, tested)
  importCsv.ts   Goodreads / StoryGraph CSV import (pure, tested)
  catalog.ts     Google Books + Open Library: parsing, merging, de-duplication (pure, tested)
  dates.ts       flexible reading dates: parse "2019", "3.2019", "14.3.2019", "März 2019" (pure, tested)
  isbn.ts        ISBN-10/13 validation and barcode parsing (pure, tested)
  color.ts       spine colours from cover pixels, readable text colour (pure, tested)
  i18n.ts        English and German text (test checks both have the same keys)
  storage.ts     settings + library in localStorage, backup files (tested)
  app.ts         shared state, saving, navigation (hash routes)
  actions.ts     add book, spine colours, backup, Ask Claude
  covers.ts      reads a cover image to get its colour
  scanner.ts     camera barcode scanning (BarcodeDetector or bundled ZXing WebAssembly)
  main.ts        picks the view for the current route
  views/         home, room, shelf, book, add, lists, stats, discover, import, help, settings
  ui/            DOM helpers, icons, sheets/toasts, bookcase drawing, ornaments, shared components
  style.css      wood theme, light/dark via CSS variables
public/          favicon.svg and generated icons
```

Book data and covers: [Google Books](https://books.google.com) and [Open Library](https://openlibrary.org).
