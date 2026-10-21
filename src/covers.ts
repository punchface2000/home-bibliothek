/**
 * Spine colors from cover images. Downloads the cover (when the server
 * allows it), shrinks it on a canvas and picks the main color. If that's
 * not possible the book keeps a palette color chosen from its title.
 */
import { clothify, dominantColor, paletteColor } from './color';
import type { Book } from './library';

export function spineColor(b: Pick<Book, 'spineColor' | 'title' | 'id'>): string {
  return b.spineColor ?? paletteColor(b.title + b.id);
}

export async function colorFromCover(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/') || blob.size < 500) return null;
    const bmp = await createImageBitmap(blob);
    const w = 24;
    const hgt = Math.max(1, Math.round((bmp.height / bmp.width) * w));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = hgt;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, hgt);
    bmp.close?.();
    const c = dominantColor(ctx.getImageData(0, 0, w, hgt).data);
    return c ? clothify(c) : null;
  } catch {
    return null;
  }
}
