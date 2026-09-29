// Translations tab: exports the .pot template + the .po of each language for several apps, with Odoo's own export
// wizard, and downloads every file straight to Downloads/<module>/i18n/ (<module>.pot, <lang>.po): nothing to unpack.
import { NEW_LANG, splitList, lastToken, pickInList, unpickInList, resolveLangs, resolveModules, b64ToBytes, gunzip, untar } from './logic.js';
import { call, cached, installedModules, el, pill, block, errBox, formValues, saveForm } from '../../shared/ui.js';
import { _t } from '../../shared/i18n.js';

export function renderTranslations(s) {
  block(s, 'export', _t('Export translations'), async () => {
    const langs = await cached('active langs', () => call('res.lang', 'search_read', [[['active', '=', true]]], { fields: ['code', 'name'], order: 'code' }));
    const last = formValues('translations');
    const apps = el('input', { type: 'text', placeholder: _t('Search or type: sale; stock; my_module'), value: last.apps || '', spellcheck: false });
    const langIn = el('input', { type: 'text', placeholder: 'vi_VN; fr_BE; fr_CA', value: last.langs || '', spellcheck: false });
    const add = (code) => {
      if (splitList(langIn.value).includes(code)) return;
      langIn.value = [...splitList(langIn.value), code].join('; ');
      langIn.focus();
    };
    const count = el('span', { class: 'muted count-note' }); // how many installed modules match what is typed
    const log = el('ul', { class: 'steps' });
    const btn = el('button', { class: 'btn', type: 'submit' }, _t('Export & Download'));
    const form = el('form', { class: 'form' },
      el('label', {}, el('span', { class: 'row' }, _t('Apps To Export'), el('span', { class: 'grow' }), count), apps),
      // no read access to ir.module.module: typing the names still works
      await modulePicker(apps, count).catch(() => el('div', { class: 'note' }, _t('Technical names, separated by ;'))),
      el('label', { class: 'mt' }, _t('Languages'), langIn),
      el('div', { class: 'row mt' }, el('span', { class: 'muted' }, _t('Active:')),
        langs.map((l) => el('button', { type: 'button', class: 'chip', title: l.name, onclick: () => add(l.code) }, l.code))),
      el('div', { class: 'note' }, _t('Always exported too: New Language (Empty translation template), as <module>.pot.')),
      el('div', { class: 'mt' }, btn),
      log);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      saveForm('translations', { apps: apps.value, langs: langIn.value });
      btn.disabled = true;
      log.replaceChildren();
      try {
        await exportAll(splitList(apps.value), splitList(langIn.value), langs.map((l) => l.code), log);
      } catch (e) {
        log.append(el('li', {}, errBox(e)));
      } finally {
        btn.disabled = false;
      }
    });
    return el('div', { class: 'pad' }, form);
  });
}

/** The installed modules below `input`, a checkbox each. One input for both: the word being typed (after the last ;)
 * searches them by name or title, ticking one puts its name in place of that word, typing a name ticks its box.
 * Enter picks the match (the exact name, else the first shown) instead of submitting while a word is being typed. */
async function modulePicker(input, count) {
  const mods = await installedModules();
  const known = new Set(mods.map((m) => m.name));
  const set = (value) => { input.value = value; input.dispatchEvent(new Event('input')); input.focus(); };
  const items = mods.map((m) => {
    const box = el('input', { type: 'checkbox', tabIndex: -1, // the input stays the one keyboard stop
      onchange: () => set((box.checked ? pickInList : unpickInList)(input.value, m.name, known)) });
    const li = el('li', {}, el('label', { class: 'row pick' }, box, el('span', { class: 'name' }, m.name), el('span', { class: 'grow muted' }, m.shortdesc)));
    li.dataset.q = `${m.name} ${m.shortdesc}`.toLowerCase();
    li.dataset.name = m.name;
    return li;
  });
  const refresh = () => {
    const picked = new Set(splitList(input.value));
    const q = lastToken(input.value).toLowerCase();
    let shown = 0;
    for (const li of items) {
      li.querySelector('input').checked = picked.has(li.dataset.name);
      li.hidden = !li.dataset.q.includes(q);
      if (!li.hidden) shown++;
    }
    count.textContent = _t('%s/%s installed modules', shown, items.length);
  };
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (ev) => {
    const tok = lastToken(input.value);
    if (ev.key !== 'Enter' || !tok) return; // nothing being typed ("sale; "): Enter exports
    ev.preventDefault();
    const shown = items.filter((li) => !li.hidden);
    const hit = shown.find((li) => li.dataset.name === tok) || shown[0];
    if (hit) set(pickInList(input.value, hit.dataset.name, known));
  });
  refresh();
  return el('div', { class: 'module-picker' }, el('ul', { class: 'list' }, items));
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
