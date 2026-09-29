// Translations tab: exports the .pot template + the .po of each language for several apps, with Odoo's own export
// wizard, and downloads every file straight to Downloads/<module>/i18n/ (<module>.pot, <lang>.po): nothing to unpack.
import { NEW_LANG, splitList, resolveLangs, resolveModules, b64ToBytes, gunzip, untar } from './logic.js';
import { call, cached, installedModules, el, pill, card, errBox, formValues, saveForm } from '../../shared/ui.js';
import { modulePicker } from '../../shared/picker.js';
import { _t } from '../../shared/i18n.js';

export function renderTranslations(s) {
  card(s, async () => { // the tab's only card: no title to open it by
    const langs = await cached('active langs', () => call('res.lang', 'search_read', [[['active', '=', true]]], { fields: ['code', 'name'], order: 'code' }));
    const last = formValues('translations');
    const apps = el('input', { type: 'text', placeholder: _t('Search or type: sale; stock; my_module'), 'aria-label': _t('Apps To Export'), value: last.apps || '', spellcheck: false });
    // Languages: the active ones as toggles (the wizard exports nothing else), the last choice kept
    const picked = new Set(resolveLangs(splitList(last.langs), langs.map((l) => l.code)).codes);
    const save = () => saveForm('translations', { apps: apps.value, langs: [...picked].join('; ') });
    const count = el('span', { class: 'muted count-note' }); // how many installed modules match what is typed
    const btn = el('button', { class: 'btn', type: 'submit' });
    const summary = () => { // what the button will download: every app gets the template + one .po per language
      const files = splitList(apps.value).length * (picked.size + 1);
      btn.textContent = !files ? _t('Export & Download') : files === 1 ? _t('Export & Download · 1 file') : _t('Export & Download · %s files', files);
    };
    const chip = (l) => {
      const b = el('button', { type: 'button', class: 'chip', title: l.name, 'aria-pressed': String(picked.has(l.code)) }, l.code);
      b.addEventListener('click', () => {
        if (picked.has(l.code)) picked.delete(l.code); else picked.add(l.code);
        b.setAttribute('aria-pressed', String(picked.has(l.code)));
        save();
        summary();
      });
      return b;
    };
    const log = el('ul', { class: 'steps' });
    const form = el('form', { class: 'form' },
      el('div', { class: 'row picker-head' }, apps, count), // no label: the placeholder and aria-label say what it is
      // no read access to ir.module.module: typing the names still works
      await installedModules().then(
        (mods) => modulePicker(apps, mods, { countEl: count, count: (n, total) => _t('%s/%s installed modules', n, total) }),
        () => el('div', { class: 'note' }, _t('Technical names, separated by ;'))),
      el('div', { class: 'row mt langs' }, el('span', { class: 'muted' }, _t('Languages:')),
        el('button', { type: 'button', class: 'chip', 'aria-pressed': 'true', disabled: true, title: _t('Always exported: the empty template, as <module>.pot') }, _t('Template (.pot)')),
        [...langs].sort((a, b) => picked.has(b.code) - picked.has(a.code)).map(chip)), // the chosen ones first, in sight
      el('div', { class: 'row mt fill' }, btn),
      log);
    apps.addEventListener('input', summary);
    summary();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      save();
      btn.disabled = true;
      log.replaceChildren();
      try {
        await exportAll(splitList(apps.value), [...picked], langs.map((l) => l.code), log);
      } catch (e) {
        log.append(el('li', {}, errBox(e)));
      } finally {
        btn.disabled = false;
      }
    });
    return el('div', { class: 'pad' }, form);
  });
}

/** One base.language.export run per language (template first); each file of its .tgz is downloaded on its own. */
async function exportAll(appNames, langNames, active, log) {
  if (!appNames.length) throw new Error(_t('Enter at least one app.'));
  const { codes, unknown } = resolveLangs(langNames, active);
  if (unknown.length) throw new Error(_t('Not an active language: %s. Active: %s', unknown.join(', '), active.join(', ')));
  const rows = await call('ir.module.module', 'search_read', [[['name', 'in', appNames]]], { fields: ['name', 'state'] });
  const { ids, missing, notInstalled } = resolveModules(appNames, rows);
  if (missing.length) throw new Error(_t('Unknown app: %s', missing.join(', ')));
  if (notInstalled.length) throw new Error(_t('Not installed: %s', notInstalled.join(', ')));

  for (const lang of [NEW_LANG, ...codes]) {
    const status = el('span', { class: 'muted' }, _t('Exporting…'));
    const files = el('div', { class: 'meta mono' });
    log.append(el('li', {}, el('div', { class: 'row' },
      el('span', { class: 'name' }, lang === NEW_LANG ? _t('Template (.pot)') : lang), el('span', { class: 'grow' }), status), files));
    try {
      // format tgz: one <module>/i18n/<lang>.po per app (format po would merge every app into a single file)
      const id = await call('base.language.export', 'create', [{ lang, format: 'tgz', modules: [[6, 0, ids]] }]);
      await call('base.language.export', 'act_getfile', [[id]]);
      const [{ data }] = await call('base.language.export', 'read', [[id], ['data']]);
      const entries = data ? untar(await gunzip(b64ToBytes(data))) : []; // 19: no term → no file
      for (const f of entries) await download(f.name, f.data);
      files.textContent = entries.map((f) => f.name).join('\n');
      status.replaceWith(entries.length ? pill(_t('%s files', entries.length), 'ok') : pill(_t('nothing to export')));
    } catch (e) {
      status.replaceWith(pill(_t('error'), 'err'));
      files.replaceWith(errBox(e));
    }
  }
}

/** Saves bytes as Downloads/<path> (sub-folders included), replacing the file of a previous export. */
async function download(path, bytes) {
  // not text/plain: Chrome would then rename vi_VN.po to vi_VN.txt
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  try {
    await chrome.downloads.download({ url, filename: path, conflictAction: 'overwrite', saveAs: false });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000); // the download reads the blob after the call returns
  }
}
