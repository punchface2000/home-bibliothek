/**
 * Spine colors. Pure functions: pick a representative color from cover
 * pixels, tone it down so it looks like book cloth, and choose readable
 * text on top. Books without a usable cover get a color from a fixed
 * palette, chosen by a hash of the title so it never changes.
 */

export type RGB = [number, number, number];

/** Book-cloth palette for books without a cover. */
export const CLOTH: string[] = [
  '#7a2e2e', // oxblood
  '#2c3e63', // navy
  '#2f5233', // forest
  '#a8792a', // mustard
  '#2f6b6b', // teal
  '#5b3a5e', // plum
  '#9a4a26', // rust
  '#3b3b40', // charcoal
  '#c9b48a', // linen
  '#5e6330', // olive
  '#6b2440', // burgundy
  '#3e5c7a' // slate blue
];

/** FNV-1a string hash → unsigned 32-bit. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function paletteColor(key: string): string {
  return CLOTH[hash(key) % CLOTH.length];
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

export function hslToRgb([h, s, l]: [number, number, number]): RGB {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

export function toHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Representative color of an RGBA pixel buffer. Pixels are grouped into
 * coarse buckets; colorful buckets get extra weight so a red cover with a
 * white title comes out red, not white. Near-transparent pixels are ignored.
 */
export function dominantColor(data: ArrayLike<number>): RGB | null {
  const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const [, s, l] = rgbToHsl([r, g, b]);
    // favour saturated, mid-lightness pixels
    const w = 1 + 4 * s * (1 - Math.abs(l - 0.5) * 2);
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
    e.w += w;
    e.r += r * w;
    e.g += g * w;
    e.b += b * w;
    buckets.set(key, e);
  }
  let best: { w: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!best || e.w > best.w) best = e;
  if (!best) return null;
  return [best.r / best.w, best.g / best.w, best.b / best.w];
}

/** Make a color look like book cloth: limit saturation and keep lightness in a usable range. */
export function clothify(c: RGB): string {
  const [h, s, l] = rgbToHsl(c);
  return toHex(hslToRgb([h, Math.min(s, 0.6), Math.min(0.72, Math.max(0.2, l))]));
}

/** Relative luminance (WCAG). */
export function luminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Dark or light text for a given background. */
export function textOn(hex: string): string {
  const c = fromHex(hex);
  if (!c) return '#f6efe2';
  return luminance(c) > 0.32 ? '#21170f' : '#f6efe2';
}
