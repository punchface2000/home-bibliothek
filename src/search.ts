/**
 * Forgiving search: every word you type is matched against title, author
 * and the rest — exact words, the start of words (while typing), words
 * inside longer ones, and small typos ("Tolstoy" finds "Tolstoi",
 * "zauberbreg" finds "Zauberberg"). Books matching every word come first;
 * books matching most words are offered as "possible matches".
 * Pure functions, no DOM.
 */

/** Lowercase, strip accents, ß → ss, punctuation → spaces. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Words of a query; very common filler words are dropped if there's anything else. */
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'by', 'der', 'die', 'das', 'und', 'von', 'ein', 'eine', 'le', 'la', 'de']);
export function queryWords(q: string): string[] {
  const words = norm(q).split(' ').filter(Boolean);
  const meaningful = words.filter((w) => !STOP.has(w));
  return meaningful.length ? meaningful : words;
}

/** Damerau–Levenshtein distance with an early exit above `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = new Array(b.length + 1).fill(0);
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev2.splice(0, prev2.length, ...prev);
    prev = cur;
  }
  return prev[b.length];
}

/** How many typos a word of this length may have. */
const allowed = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

/**
 * How well one typed word matches a text (already normalized, as tokens).
 * 1 exact · .9 start of a word · .75 inside a word · .65 typo · .55 typo while typing · 0 none
 */
export function wordScore(w: string, tokens: string[], joined: string, fuzzy = true, compact = joined.replace(/ /g, '')): number {
  let best = 0;
  const typos = fuzzy ? allowed(w.length) : 0;
  for (const t of tokens) {
    if (t === w) return 1;
    if (t.startsWith(w)) best = Math.max(best, w.length >= 2 || tokens.length === 1 ? 0.9 : 0.5);
    else if (w.length >= 3 && t.includes(w)) best = Math.max(best, 0.75);
    // typo check (costly) only when the word starts roughly the same way
    else if (typos && best < 0.65 && (t[0] === w[0] || t[1] === w[1] || t[0] === w[1])) {
      if (editDistance(w, t, typos) <= typos) best = Math.max(best, 0.65);
      // still typing a long word with a typo: compare with the same-length start of the word
      else if (t.length > w.length && w.length >= 5 && editDistance(w, t.slice(0, w.length), 1) <= 1) best = Math.max(best, 0.55);
    }
  }
  // words typed together or apart: "harrypotter", "zauber berg"
  if (fuzzy && best < 0.75 && w.length >= 5 && compact.includes(w)) best = Math.max(best, 0.7);
  return best;
}

export interface Field {
  text: string;
  weight: number;
  /** allow typos in this field (default true; off for long free text like notes) */
  fuzzy?: boolean;
}

export interface Prepared {
  fields: { tokens: string[]; joined: string; compact: string; weight: number; fuzzy: boolean }[];
}

export function prepare(fields: Field[]): Prepared {
  return {
    fields: fields
      .filter((f) => f.text)
      .map((f) => {
        const joined = norm(f.text);
        return { tokens: joined.split(' ').filter(Boolean), joined, compact: joined.replace(/ /g, ''), weight: f.weight, fuzzy: f.fuzzy !== false };
      })
  };
}

export interface Match {
  /** how many query words matched somewhere */
  matched: number;
  total: number;
  score: number;
}

export function matchPrepared(words: string[], p: Prepared): Match {
  let matched = 0;
  let score = 0;
  for (const w of words) {
    let best = 0;
    for (const f of p.fields) {
      const s = wordScore(w, f.tokens, f.joined, f.fuzzy, f.compact) * f.weight;
      if (s > best) best = s;
    }
    if (best > 0) {
      matched++;
      score += best;
    }
  }
  return { matched, total: words.length, score };
}

export interface Ranked<T> {
  /** match every word */
  best: T[];
  /** match most words — offered as "possible matches" */
  possible: T[];
}

/**
 * Rank items for a query. `fields` describes what to search in each item.
 * Partial matches need at least half of the words (and at least one).
 */
export function rank<T>(items: T[], query: string, fields: (item: T) => Field[], opts: { keepOrder?: boolean; cache?: WeakMap<object, Prepared> } = {}): Ranked<T> {
  const words = queryWords(query);
  if (!words.length) return { best: [], possible: [] };
  const need = Math.max(1, Math.ceil(words.length / 2));
  // prepared text is cached per item object (books are replaced, not changed, when edited)
  const prep = (item: T): Prepared => {
    const key = item as unknown as object;
    let p = opts.cache && typeof item === 'object' ? opts.cache.get(key) : undefined;
    if (!p) {
      p = prepare(fields(item));
      if (opts.cache && typeof item === 'object') opts.cache.set(key, p);
    }
    return p;
  };
  const scored = items.map((item, i) => ({ item, i, m: matchPrepared(words, prep(item)) }));
  const byScore = (a: (typeof scored)[number], b: (typeof scored)[number]) => (opts.keepOrder ? 0 : b.m.score - a.m.score) || a.i - b.i;
  const best = scored.filter((s) => s.m.matched === words.length).sort(byScore);
  const possible = scored
    .filter((s) => s.m.matched < words.length && s.m.matched >= need)
    .sort((a, b) => b.m.matched - a.m.matched || byScore(a, b));
  return { best: best.map((s) => s.item), possible: possible.map((s) => s.item) };
}
