import { describe, expect, it } from 'vitest';
import { BOOKEND_W, DECOR_SIZE, fitRows, packRows, planDecor, rng, rowUsed, spineHeight, spineWidth } from './shelfLayout';

describe('spines', () => {
  it('width follows page count within limits', () => {
    expect(spineWidth({ id: 'a', pages: 96 })).toBe(16);
    expect(spineWidth({ id: 'a', pages: 400 })).toBe(30);
    expect(spineWidth({ id: 'a', pages: 2000 })).toBe(46);
    const w = spineWidth({ id: 'x' });
    expect(w).toBeGreaterThanOrEqual(16);
    expect(w).toBeLessThanOrEqual(46);
  });

  it('height varies but stays in range', () => {
    for (const id of ['a', 'b', 'c', 'd']) {
      const v = spineHeight({ id, title: 'T' });
      expect(v).toBeGreaterThanOrEqual(0.74);
      expect(v).toBeLessThan(0.96);
    }
  });
});

describe('packing', () => {
  it('packs greedily without exceeding the row', () => {
    const widths = [30, 30, 30, 30, 30];
    const rows = packRows(widths, 95, 1);
    expect(rows).toEqual([[0, 1, 2], [3, 4]]);
    for (const r of rows) expect(rowUsed(widths, r)).toBeLessThanOrEqual(95);
  });

  it('puts an over-wide item on its own row', () => {
    expect(packRows([200, 10], 100)).toEqual([[0], [1]]);
    expect(packRows([], 100)).toEqual([]);
  });

  it('fits rows into the available height', () => {
    expect(fitRows(630, 210, 14)).toEqual({ rows: 3, rowHeight: 196 });
    expect(fitRows(900, 210, 14)).toEqual({ rows: 4, rowHeight: 211 });
    expect(fitRows(100, 210, 14).rows).toBe(3);
  });
});

describe('decor', () => {
  it('rng is deterministic', () => {
    const a = rng(42);
    const b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('same seed gives the same plan', () => {
    const p1 = planDecor([300, 120, 0, 0], 340, 196, 'shelf-1');
    const p2 = planDecor([300, 120, 0, 0], 340, 196, 'shelf-1');
    expect(p1).toEqual(p2);
  });

  it('never places things that do not fit', () => {
    for (let s = 0; s < 200; s++) {
      const used = [330, 200, 0, 0];
      const plan = planDecor(used, 340, 196, `seed${s}`);
      plan.forEach((p, i) => {
        let free = 340 - used[i];
        if (p.bookend) {
          expect(used[i]).toBeGreaterThan(0);
          free -= BOOKEND_W * 196 + 4;
        }
        if (p.decor) expect(DECOR_SIZE[p.decor.kind][0] * 196).toBeLessThanOrEqual(free);
      });
      expect(plan[0].decor).toBeUndefined(); // only 10 px left on the full row
    }
  });

  it('gives an empty case several ornaments', () => {
    let total = 0;
    for (let s = 0; s < 50; s++) total += planDecor([0, 0, 0, 0], 340, 196, `e${s}`).filter((p) => p.decor).length;
    expect(total / 50).toBeGreaterThan(2);
  });

  it('never leaves three empty planks in a row bare', () => {
    for (let s = 0; s < 100; s++) {
      const plan = planDecor([200, 0, 0, 0, 0, 0, 0, 0], 340, 120, `b${s}`);
      let bare = 0;
      for (const p of plan.slice(1)) {
        bare = p.decor ? 0 : bare + 1;
        expect(bare).toBeLessThan(3);
      }
    }
  });

  it('adds bookends next to books when there is room', () => {
    const plan = planDecor([100, 0], 340, 196, 'x');
    expect(plan[0].bookend).toBe(true);
    expect(plan[1].bookend).toBe(false);
  });
});
