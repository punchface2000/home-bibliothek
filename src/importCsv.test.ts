import { describe, expect, it } from 'vitest';
import { parseCsv, readReadingExport, splitSeries } from './importCsv';

const GOODREADS = [
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies',
  '2767052,"The Hunger Games (The Hunger Games, #1)",Suzanne Collins,"Collins, Suzanne",,"=""0439023483""","=""9780439023481""",4,4.31,Scholastic Press,Hardcover,374,2008,2008,2019/03/14,2018/01/02,"favorites, ya",,read,"Gripping.<br/>Loved it, really.",,,1,1',
  '5907,The Hobbit,J.R.R. Tolkien,"Tolkien, J.R.R.",,"=""""","=""""",0,4.28,Houghton Mifflin,Kindle Edition,366,2002,1937,,2020/05/05,currently-reading,,currently-reading,,,"my notes",0,0',
  '1,"Der Process",Franz Kafka,"Kafka, Franz",Max Brod,,,0,3.9,,Taschenbuch,240,1925,1925,,2021/01/01,"to-read, klassiker",,to-read,,,,0,0',
  '2,"Anna Karenina",Leo Tolstoy,,,,,2,4,,Paperback,864,,1878,,2021/01/01,did-not-finish,,did-not-finish,,,,0,0'
].join('\r\n');

const STORYGRAPH = [
  'Title,Authors,Contributors,ISBN/UID,Format,Read Status,Date Added,Last Date Read,Dates Read,Read Count,Moods,Pace,Character- or Plot-Driven?,Strong Character Development?,Loveable Characters?,Diverse Characters?,Flawed Characters?,Star Rating,Review,Content Warnings,Content Warning Description,Tags,Owned?',
  'Piranesi,Susanna Clarke,,9781526622426,hardcover,read,2023/01/01,2023/02/20,2023/02/01-2023/02/20,1,mysterious,medium,,,,,,4.75,"Strange, beautiful.",,,"favourite, signed",Yes',
  'Project Hail Mary,Andy Weir,Ray Porter,B08FHBV4ZX,audio,currently-reading,2024/03/03,,2024/03/10,0,,,,,,,,,,,,,No',
  'Middlemarch,George Eliot,,9780141439549,paperback,did-not-finish,2022/01/01,,,0,,,,,,,,,,,,,'
].join('\n');

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and line breaks in fields, BOM, CRLF', () => {
    const rows = parseCsv('﻿a,b,c\r\n"x, y","he said ""hi""","line1\nline2"\r\n\r\n1,,3');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'he said "hi"', 'line1\nline2'],
      ['1', '', '3']
    ]);
  });
});

describe('splitSeries', () => {
  it('splits "(Series, #n)" from the title', () => {
    expect(splitSeries('The Hunger Games (The Hunger Games, #1)')).toEqual({ title: 'The Hunger Games', series: 'The Hunger Games', seriesNo: 1 });
    expect(splitSeries('Dune Messiah (Dune #2)')).toEqual({ title: 'Dune Messiah', series: 'Dune', seriesNo: 2 });
    expect(splitSeries('Novella (Saga, #2.5)').seriesNo).toBe(2.5);
    expect(splitSeries('Plain title (2nd edition)')).toEqual({ title: 'Plain title (2nd edition)' });
  });
});

describe('Goodreads export', () => {
  const r = readReadingExport(GOODREADS)!;

  it('is recognised', () => {
    expect(r.source).toBe('goodreads');
    expect(r.books).toHaveLength(4);
    expect(r.hasOwnership).toBe(true);
  });

  it('maps a read book with series, ISBN, rating, date, format, tags, review', () => {
    const b = r.books[0];
    expect(b).toMatchObject({
      title: 'The Hunger Games',
      series: 'The Hunger Games',
      seriesNo: 1,
      authors: ['Suzanne Collins'],
      isbn: '9780439023481',
      rating: 4,
      pages: 374,
      year: 2008,
      format: 'hardcover',
      status: 'read',
      finished: '2019-03-14',
      tags: ['favorites', 'ya'],
      ownedInFile: true
    });
    expect(b.remarks).toBe('Gripping.\nLoved it, really.');
  });

  it('maps currently reading, to-read, did-not-finish and other details', () => {
    const [, hobbit, process, anna] = r.books;
    expect(hobbit).toMatchObject({ status: 'reading', format: 'ebook', year: 1937, remarks: 'my notes', ownedInFile: false });
    expect(hobbit.isbn).toBeUndefined();
    expect(hobbit.rating).toBeUndefined();
    expect(process).toMatchObject({ status: 'toread', authors: ['Franz Kafka', 'Max Brod'], format: 'paperback', tags: ['klassiker'] });
    expect(anna.status).toBe('abandoned');
  });
});

describe('StoryGraph export', () => {
  const r = readReadingExport(STORYGRAPH)!;

  it('is recognised and mapped', () => {
    expect(r.source).toBe('storygraph');
    expect(r.books).toHaveLength(3);
    const [pir, phm, mid] = r.books;
    expect(pir).toMatchObject({ title: 'Piranesi', isbn: '9781526622426', format: 'hardcover', status: 'read', rating: 5, started: '2023-02-01', finished: '2023-02-20', tags: ['favourite', 'signed'], ownedInFile: true, remarks: 'Strange, beautiful.' });
    expect(phm).toMatchObject({ status: 'reading', format: 'audiobook', started: '2024-03-10', ownedInFile: false });
    expect(phm.isbn).toBeUndefined(); // an ASIN, not an ISBN
    expect(mid).toMatchObject({ status: 'abandoned', format: 'paperback' });
    expect(mid.ownedInFile).toBeUndefined();
  });
});

describe('other files', () => {
  it('rejects unknown CSVs', () => {
    expect(readReadingExport('name,age\nbob,3')).toBeNull();
    expect(readReadingExport('')).toBeNull();
  });
});
