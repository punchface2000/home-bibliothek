/** Tiny DOM helpers so views can be written as nested calls. */

type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown> & {
  class?: string;
  style?: string | Partial<CSSStyleDeclaration>;
  html?: string;
  dataset?: Record<string, string>;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else Object.assign(el.style, v);
      } else if (k === 'dataset') Object.assign(el.dataset, v as Record<string, string>);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

/** An element holding an SVG icon string. */
export function icon(svg: string, cls = 'icon'): HTMLSpanElement {
  return h('span', { class: cls, html: svg, 'aria-hidden': 'true' });
}

/** Icon button with an accessible label. */
export function iconButton(svg: string, label: string, onClick: (e: MouseEvent) => void, cls = 'icon-btn'): HTMLButtonElement {
  return h('button', { class: cls, type: 'button', 'aria-label': label, title: label, onClick }, icon(svg));
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): ((...a: A) => void) & { flush(): void; cancel(): void } {
  let timer = 0;
  let last: A | null = null;
  const d = (...a: A) => {
    last = a;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      last = null;
      fn(...a);
    }, ms);
  };
  d.flush = () => {
    clearTimeout(timer);
    if (last) {
      const a = last;
      last = null;
      fn(...a);
    }
  };
  d.cancel = () => {
    clearTimeout(timer);
    last = null;
  };
  return d;
}

export function formatDate(ts: number, lang: string): string {
  try {
    return new Date(ts).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
