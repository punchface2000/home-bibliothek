/** Help sheet, the one-time welcome cards, and the backup reminder bar. */
import { exportBackup } from '../actions';
import { lib, settings, t, updateSettings } from '../app';
import { needsBackupReminder } from '../storage';
import { h, icon, iconButton } from '../ui/dom';
import { I } from '../ui/icons';
import { openSheet } from '../ui/overlay';

const iconFor = (name: string) => (I as Record<string, string>)[name] ?? I.book;

export function helpSheet(): void {
  openSheet(t.helpTitle, (body, close) => {
    body.append(
      h(
        'div',
        { class: 'help-list' },
        ...t.helpItems.map(([ic, title, text]) =>
          h('section', { class: 'help-item' }, h('span', { class: 'help-icon' }, icon(iconFor(ic))), h('div', null, h('h3', null, title), h('p', null, text)))
        )
      ),
      h(
        'button',
        {
          class: 'btn wide',
          type: 'button',
          onClick: () => {
            close();
            window.setTimeout(showWelcome, 250);
          }
        },
        icon(I.sparkle),
        t.showWelcome
      )
    );
  });
}

/** Three swipeable cards, shown once on first launch (and again from Help). */
export function showWelcome(): void {
  if (document.querySelector('.welcome-tour')) return;
  const cards = t.welcomeCards;
  let index = 0;
  const track = h(
    'div',
    { class: 'tour-track' },
    ...cards.map(([ic, title, text], i) =>
      h('section', { class: 'tour-card', 'aria-roledescription': 'slide', 'aria-label': `${i + 1} / ${cards.length}` }, h('span', { class: 'tour-icon' }, icon(iconFor(ic))), h('h2', null, title), h('p', null, text))
    )
  );
  const dots = h('div', { class: 'tour-dots', 'aria-hidden': 'true' }, ...cards.map(() => h('span')));
  const nextBtn = h('button', { class: 'btn primary', type: 'button', onClick: () => (index < cards.length - 1 ? goTo(index + 1) : finish()) });
  const skipBtn = h('button', { class: 'btn tour-skip', type: 'button', onClick: () => finish() }, t.skip);
  const el = h(
    'div',
    { class: 'welcome-tour', role: 'dialog', 'aria-modal': 'true', 'aria-label': cards[0][1] },
    h('div', { class: 'tour-box' }, track, dots, h('div', { class: 'btn-row' }, skipBtn, nextBtn))
  );

  function sync(): void {
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === index));
    const last = index === cards.length - 1;
    nextBtn.textContent = last ? t.start : t.next;
    skipBtn.style.visibility = last ? 'hidden' : 'visible';
  }
  function goTo(i: number): void {
    index = i;
    track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
    sync();
  }
  function finish(): void {
    updateSettings({ welcomeSeen: true }, false);
    el.classList.remove('shown');
    window.setTimeout(() => el.remove(), 250);
  }
  track.addEventListener(
    'scroll',
    () => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (i !== index) {
        index = i;
        sync();
      }
    },
    { passive: true }
  );
  sync();
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('shown')));
}

/** A one-line reminder on the home screen when a backup is overdue, or null. */
export function backupReminder(): HTMLElement | null {
  if (!needsBackupReminder(lib.books.length, settings.lastBackup, settings.backupNudgeDismissed)) return null;
  const el: HTMLElement = h(
    'div',
    { class: 'nudge', role: 'status' },
    icon(I.download, 'icon nudge-icon'),
    h('span', { class: 'nudge-text' }, t.backupNudge),
    h(
      'button',
      {
        class: 'btn small primary',
        type: 'button',
        onClick: async () => {
          await exportBackup();
          if (settings.lastBackup) el.remove();
        }
      },
      t.exportShort
    ),
    iconButton(I.close, t.later, () => {
      updateSettings({ backupNudgeDismissed: Date.now() }, false);
      el.remove();
    }, 'icon-btn icon-btn-sm')
  );
  return el;
}
