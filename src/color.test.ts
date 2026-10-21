import { describe, expect, it } from 'vitest';
import { CLOTH, clothify, dominantColor, fromHex, hash, hslToRgb, paletteColor, rgbToHsl, textOn, toHex, type RGB } from './color';

function pixels(list: [RGB, number][]): Uint8ClampedArray {
  const total = list.reduce((n, [, c]) => n + c, 0);
  const a = new Uint8ClampedArray(total * 4);
  let i = 0;
  for (const [[r, g, b], count] of list) for (let k = 0; k < count; k++) a.set([r, g, b, 255], 4 * i++);
  return a;
}

describe('color', () => {
  it('round-trips hsl and hex', () => {
    const c: RGB = [122, 46, 46];
    const back = hslToRgb(rgbToHsl(c));
    back.forEach((v, i) => expect(Math.abs(v - c[i])).toBeLessThanOrEqual(1));
    expect(toHex([255, 0, 16])).toBe('#ff0010');
    expect(fromHex('#ff0010')).toEqual([255, 0, 16]);
    expect(fromHex('nope')).toBeNull();
  });

  it('palette color is stable and from the palette', () => {
    expect(paletteColor('Stoner')).toBe(paletteColor('Stoner'));
    expect(CLOTH).toContain(paletteColor('anything'));
    expect(hash('a')).not.toBe(hash('b'));
  });

  it('prefers the colorful part of a cover over white text', () => {
    const data = pixels([
      [[250, 250, 250], 40], // white title area
      [[180, 30, 30], 30] // red background
    ]);
    const [r, g, b] = dominantColor(data)!;
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60);
  });

  it('ignores transparent pixels and handles empty input', () => {
    expect(dominantColor(new Uint8ClampedArray([10, 10, 10, 0]))).toBeNull();
    expect(dominantColor([])).toBeNull();
  });

  it('clothify keeps colors in a readable range', () => {
    const [, s1, l1] = rgbToHsl(fromHex(clothify([255, 0, 0]))!);
    expect(s1).toBeLessThanOrEqual(0.61);
    const [, , l2] = rgbToHsl(fromHex(clothify([255, 255, 255]))!);
    expect(l2).toBeLessThanOrEqual(0.73);
    const [, , l3] = rgbToHsl(fromHex(clothify([0, 0, 0]))!);
    expect(l3).toBeGreaterThanOrEqual(0.19);
    expect(l1).toBeGreaterThan(0);
  });

  it('picks readable text color', () => {
    expect(textOn('#2c3e63')).toBe('#f6efe2');
    expect(textOn('#c9b48a')).toBe('#21170f');
  });
});
