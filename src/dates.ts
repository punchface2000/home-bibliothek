/**
 * Flexible reading dates: a year ("2019"), a month ("2019-03") or a full
 * day ("2019-03-14"). Stored in that ISO-like form; typed and shown in a
 * friendly way. Pure functions, no DOM.
 */
import type { Lang } from './library';

/** Stored form: YYYY, YYYY-MM or YYYY-MM-DD. */
export type FlexDate = string;

const MIN_YEAR = 1800;
const MAX_YEAR = 2100;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, januar: 1, jaenner: 1, janner: 1,
  feb: 2, february: 2, februar: 2,
  mar: 3, march: 3, mrz: 3, marz: 3, maerz: 3,
  apr: 4, april: 4,
  may: 5, mai: 5,
  jun: 6, june: 6, juni: 6,
  jul: 7, july: 7, juli: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, okt: 10, oktober: 10,
  nov: 11, november: 11,
  dec: 12, december: 12, dez: 12, dezember: 12
};

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

function daysIn(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Is this a valid stored value? */
export function isFlexDate(s: unknown): s is FlexDate {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(s);
  if (!m) return false;
  const y = +m[1];
  if (y < MIN_YEAR || y > MAX_YEAR) return false;
  if (m[2] === undefined) return true;
  const mo = +m[2];
  if (mo < 1 || mo > 12) return false;
  if (m[3] === undefined) return true;
  const d = +m[3];
  return d >= 1 && d <= daysIn(y, mo);
}

function year(token: string, nowYear: number): number | null {
  if (!/^\d+$/.test(token)) return null;
  if (token.length === 4) return +token;
  if (token.length === 2) {
    // two-digit years: up to this year → 20xx, otherwise 19xx
    const n = +token;
    return n <= nowYear % 100 ? 2000 + n : 1900 + n;
  }
  return null;
}

function month(token: string): number | null {
  if (/^\d{1,2}$/.test(token)) {
    const n = +token;
    return n >= 1 && n <= 12 ? n : null;
  }
  const key = token
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.$/, '');
  return MONTHS[key] ?? null;
}

function build(y: number | null, m: number | null = null, d: number | null = null): FlexDate | null {
  if (y === null) return null;
  const out = m === null ? `${y}` : d === null ? `${y}-${pad(m)}` : `${y}-${pad(m)}-${pad(d)}`;
  return isFlexDate(out) ? out : null;
}

/**
 * Read what the user typed. Accepts, for example:
 * 2019 · 3.2019 · 03/2019 · März 2019 · Mar 2019 · 2019-03 ·
 * 14.3.2019 · 14/03/2019 · 14 March 2019 · 2019-03-14 · 3.19
 * Day-first (European) order for numeric dates. Returns '' for empty input,
 * null if it can't be understood.
 */
export function parseFlexDate(text: string, now = new Date()): FlexDate | '' | null {
  const raw = text.trim();
  if (!raw) return '';
  const nowYear = now.getFullYear();
  const tokens = raw.split(/[\s.,/\-]+/).filter(Boolean);
  if (!tokens.length || tokens.length > 3) return null;

  // year first: 2019, 2019-03, 2019-03-14
  if (/^\d{4}$/.test(tokens[0])) {
    const y = +tokens[0];
    if (tokens.length === 1) return build(y);
    const m = month(tokens[1]);
    if (m === null) return null;
    if (tokens.length === 2) return build(y, m);
    const d = /^\d{1,2}$/.test(tokens[2]) ? +tokens[2] : null;
    return d === null ? null : build(y, m, d);
  }

  if (tokens.length === 1) return null; // "March" or "14" alone is not enough

  if (tokens.length === 2) {
    // month + year: 3.2019, März 2019, 3.19
    const m = month(tokens[0]);
    const y = year(tokens[1], nowYear);
    return m === null ? null : build(y, m);
  }

  // day + month + year: 14.3.2019, 14 März 2019; also "March 14 2019"
  let d: number | null = /^\d{1,2}$/.test(tokens[0]) ? +tokens[0] : null;
  let m = month(tokens[1]);
  if (d === null && /^\d{1,2}$/.test(tokens[1])) {
    m = month(tokens[0]);
    d = +tokens[1];
  }
  const y = year(tokens[2], nowYear);
  return d === null || m === null ? null : build(y, m, d);
}

/** Friendly display: de "14.03.2019" / "03.2019" / "2019", en "14 Mar 2019" / "Mar 2019" / "2019". */
export function formatFlexDate(s: FlexDate | undefined, lang: Lang): string {
  if (!s || !isFlexDate(s)) return '';
  const [y, m, d] = s.split('-').map(Number);
  if (lang === 'de') return m === undefined ? `${y}` : d === undefined ? `${pad(m)}.${y}` : `${pad(d)}.${pad(m)}.${y}`;
  return m === undefined ? `${y}` : d === undefined ? `${EN_MONTHS[m - 1]} ${y}` : `${d} ${EN_MONTHS[m - 1]} ${y}`;
}

/** Today as a full date. */
export function todayFlex(now = new Date()): FlexDate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * True if `finished` is certainly before `started`. Only the precision both
 * have in common is compared, so "2019" vs "2019-05" is never a conflict.
 */
export function datesConflict(started: FlexDate | undefined, finished: FlexDate | undefined): boolean {
  if (!started || !finished) return false;
  const len = Math.min(started.length, finished.length);
  return finished.slice(0, len) < started.slice(0, len);
}
