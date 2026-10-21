/** Settings sheet and the "Ask Claude" sheets. */
import { copyAndOpenClaude, copyText, exportBackup, importBackupFile } from '../actions';
import { lang, lib, settings, t, updateSettings } from '../app';
import { recommendationPrompt, similarPrompt, type Book } from '../library';
import type { LangSetting, Theme } from '../storage';
import { segmented } from '../ui/components';
import { formatDate, h, icon } from '../ui/dom';
import { I } from '../ui/icons';
import { openSheet, toast } from '../ui/overlay';

export function settingsSheet(): void {
  openSheet(t.settings, (body, close) => {
    const fileInput = h('input', {
      type: 'file',
      accept: 'application/json,.json',
      hidden: true,
      onChange: async () => {
        const f = fileInput.files?.[0];
        if (f) {
          close();
          await importBackupFile(f);
        }
      }
    });
    const lastBackup = h('p', { class: 'muted small' }, settings.lastBackup ? t.lastBackup(formatDate(settings.lastBackup, lang)) : t.neverBackedUp);
    body.append(
      h(
        'div',
        { class: 'field' },
        h('span', null, t.theme),
        segmented<Theme>(
          [
            { value: 'auto', label: t.themeAuto },
            { value: 'light', label: t.themeLight },
            { value: 'dark', label: t.themeDark }
          ],
          settings.theme,
          (v) => updateSettings({ theme: v })
        )
      ),
      h(
        'div',
        { class: 'field' },
        h('span', null, t.language),
        segmented<LangSetting>(
          [
            { value: 'auto', label: t.langAuto },
            { value: 'en', label: 'English' },
            { value: 'de', label: 'Deutsch' }
          ],
          settings.lang,
          (v) => {
            updateSettings({ lang: v });
            close();
            settingsSheet(); // reopen in the new language
          }
        )
      ),
      h(
        'div',
        { class: 'field' },
        h('span', null, t.backup),
        h('p', { class: 'small' }, t.backupText),
        lastBackup,
        h(
          'div',
          { class: 'btn-row' },
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              onClick: async () => {
                await exportBackup();
                lastBackup.textContent = settings.lastBackup ? t.lastBackup(formatDate(settings.lastBackup, lang)) : t.neverBackedUp;
              }
            },
            icon(I.download),
            t.exportBackup
          ),
          h('button', { class: 'btn', type: 'button', onClick: () => fileInput.click() }, icon(I.upload), t.importBackup)
        ),
        fileInput
      ),
      h('p', { class: 'muted small about' }, t.dataSources, h('br'), `Home Library · ${t.books(lib.books.length)}`)
    );
  });
}

function promptSheet(title: string, text: string, prompt: string): void {
  openSheet(title, (body) => {
    const pre = h('textarea', { class: 'prompt-preview', readOnly: true, rows: 7, 'aria-label': 'Prompt' }, prompt);
    body.append(
      h('p', { class: 'sheet-text' }, text),
      pre,
      h(
        'div',
        { class: 'btn-row' },
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onClick: async () => {
              const ok = await copyText(prompt);
              toast(ok ? t.copied : t.copyFailed);
              if (!ok) pre.select();
            }
          },
          icon(I.copy),
          t.copyOnly
        ),
        h('button', { class: 'btn primary', type: 'button', onClick: () => copyAndOpenClaude(prompt) }, icon(I.sparkle), t.copyOpen)
      )
    );
  });
}

export function askClaudeSheet(): void {
  promptSheet(t.askTitle, t.askText, recommendationPrompt(lib, lang));
}

export function askSimilarSheet(b: Book): void {
  promptSheet(t.similarClaude, t.askSimilarText, similarPrompt(b, lang));
}
