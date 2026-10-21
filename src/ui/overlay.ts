/** Bottom sheets, confirm/prompt dialogs and toasts. */
import { t } from '../app';
import { h, iconButton } from './dom';
import { I } from './icons';

export interface Sheet {
  el: HTMLElement;
  body: HTMLElement;
  close(): void;
}

const open: Sheet[] = [];

/** Open a bottom sheet. `build` fills the body and gets a close function. */
export function openSheet(title: string, build: (body: HTMLElement, close: () => void) => void, opts: { onClose?: () => void; wide?: boolean } = {}): Sheet {
  const host = document.getElementById('sheets')!;
  const body = h('div', { class: 'sheet-body' });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.remove('shown');
    const i = open.indexOf(sheet);
    if (i >= 0) open.splice(i, 1);
    window.setTimeout(() => el.remove(), 220);
    opts.onClose?.();
  };
  const card = h(
    'div',
    { class: 'sheet-card' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' }, h('h2', null, title), iconButton(I.close, t.close, close)),
    body
  );
  const el = h('div', { class: 'sheet', onClick: (e: MouseEvent) => e.target === el && close() }, card);
  const sheet: Sheet = { el, body, close };
  build(body, close);
  host.appendChild(el);
  open.push(sheet);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('shown')));
  return sheet;
}

export function closeAllSheets(): void {
  for (const s of [...open]) s.close();
}

export function topSheetOpen(): boolean {
  return open.length > 0;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && open.length) open[open.length - 1].close();
});

export function confirmSheet(title: string, text: string, okLabel: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    openSheet(
      title,
      (body, close) => {
        body.append(
          h('p', { class: 'sheet-text' }, text),
          h(
            'div',
            { class: 'btn-row' },
            h('button', { class: 'btn', type: 'button', onClick: () => close() }, t.cancel),
            h(
              'button',
              {
                class: 'btn ' + (danger ? 'danger' : 'primary'),
                type: 'button',
                onClick: () => {
                  answered = true;
                  resolve(true);
                  close();
                }
              },
              okLabel
            )
          )
        );
      },
      { onClose: () => !answered && resolve(false) }
    );
  });
}

export function promptSheet(title: string, label: string, initial = '', okLabel = t.save): Promise<string | null> {
  return new Promise((resolve) => {
    let answered = false;
    openSheet(
      title,
      (body, close) => {
        const input = h('input', { class: 'input', type: 'text', value: initial, 'aria-label': label, placeholder: label, enterkeyhint: 'done', maxlength: 60 });
        const submit = () => {
          const v = input.value.trim();
          if (!v) return input.focus();
          answered = true;
          resolve(v);
          close();
        };
        input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
        body.append(
          h('label', { class: 'field' }, h('span', null, label), input),
          h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onClick: () => close() }, t.cancel), h('button', { class: 'btn primary', type: 'button', onClick: submit }, okLabel))
        );
        window.setTimeout(() => input.focus(), 250);
      },
      { onClose: () => !answered && resolve(null) }
    );
  });
}

let toastTimer = 0;

export function toast(text: string, action?: { label: string; run: () => void }, ms = 2800): void {
  const el = document.getElementById('toast')!;
  el.replaceChildren(h('span', null, text));
  if (action)
    el.appendChild(
      h('button', { type: 'button', class: 'toast-action', onClick: () => (hide(), action.run()) }, action.label)
    );
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('shown'));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hide, action ? ms + 1500 : ms);
  function hide() {
    el.classList.remove('shown');
    window.setTimeout(() => (el.hidden = !el.classList.contains('shown')), 250);
  }
}
