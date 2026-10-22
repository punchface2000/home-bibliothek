/** Settings sheet and the "Ask Claude" sheets. */
import { copyAndOpenClaude, copyText, exportBackup, importBackupFile, saveLibrarySearch } from '../actions';
import { lang, lib, settings, t, updateSettings } from '../app';
import { recommendationPrompt, similarPrompt, type Book } from '../library';
import type { LangSetting, Theme } from '../storage';
import { segmented } from '../ui/components';
import { formatDate, h, icon } from '../ui/dom';
import { I } from '../ui/icons';
import { openSheet, toast } from '../ui/overlay';
import { helpSheet } from './help';
import { importReadingFile } from './importSheet';

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
    const csvInput = h('input', {
      type: 'file',
      accept: '.csv,text/csv,text/comma-separated-values,application/vnd.ms-excel',
      hidden: true,
      onChange: async () => {
        const f = csvInput.files?.[0];
        csvInput.value = '';
        if (f) {
          close();
          await importReadingFile(f);
        }
      }
    });
    const libInput = h('input', { class: 'input', type: 'url', inputmode: 'url', autocapitalize: 'off', spellcheck: false, placeholder: 'https://…XYZZY…', value: settings.librarySearch, 'aria-label': t.librarySearch });
    const saveLib = () => {
      if (saveLibrarySearch(libInput.value)) toast(t.librarySearchSaved);
      else toast(t.librarySearchBad);
    };
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
      h(
        'div',
        { class: 'field' },
        h('span', null, t.importReading),
        h('p', { class: 'small' }, t.importHelp),
        h('button', { class: 'btn', type: 'button', onClick: () => csvInput.click() }, icon(I.upload), t.importReading),
        csvInput
      ),
      h(
        'div',
        { class: 'field' },
        h('span', null, t.librarySearch),
        h('p', { class: 'small' }, t.librarySearchHelp),
        h('div', { class: 'input-row' }, libInput, h('button', { class: 'btn', type: 'button', onClick: saveLib }, t.save))
      ),
      h('button', { class: 'btn wide', type: 'button', onClick: () => (close(), window.setTimeout(helpSheet, 250)) }, icon(I.help), t.helpTitle),
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
