// Apps tab, one card: a list of modules (typed, or ticked below the input, which also searches them) to Activate
// (Update Apps List, then install them all), Upgrade, or open their forms in new tabs. Same server methods as Odoo's
// Apps menu; install / upgrade then reload the Odoo page. The list shows the installed modules, and every module
// matching the word being typed, installed or not.
import { planInstall, planUpgrade, stateKind, moduleFilter } from './logic.js';
import { splitList } from '../translations/logic.js';
import { exec, tabId, call, sessionInfo, el, pill, empty, card, errBox, odooLink, formValues, saveForm } from '../../shared/ui.js';
import { modulePicker } from '../../shared/picker.js';
import { _t } from '../../shared/i18n.js';

const read = (names) => call('ir.module.module', 'search_read', [[['name', 'in', names]]], { fields: ['name', 'shortdesc', 'state', 'latest_version'] });
const formPath = (id) => `action-base.open_module_tree/${id}`; // the Apps action: its breadcrumb leads back to Apps
const names = (list) => list.map((m) => m.name).join(', ');
const needsAdmin = () => empty(_t('Needs Settings rights (base.group_system).'));

export function renderApps(s, state) {
  card(s, async () => { // the tab's only card: no title to open it by
    if (!(await sessionInfo()).is_system) return needsAdmin();
    const last = formValues('apps');
    const input = el('input', { type: 'text', placeholder: _t('Search or type: sale; stock; my_module'), 'aria-label': _t('Modules'), value: last.modules || '', spellcheck: false });
    // Odoo's Apps filters, kept across reloads (the list opens on the installed modules, as the Apps menu opens on Apps)
    const f = last.filters || { installed: true };
    if (typeof f.category !== 'string') f.category = null; // an id, saved before categories went by name
    const save = () => saveForm('apps', { modules: input.value, filters: f });
    const count = el('span', { class: 'muted count-note' });
    const log = el('ul', { class: 'steps' });
    // every module (Update Apps List adds the new ones: they show after the page reloads)
    const mods = await call('ir.module.module', 'search_read', [[]], { fields: ['name', 'shortdesc', 'state', 'latest_version', 'author', 'application', 'category_id'], order: 'name' });
    let keep = moduleFilter(f);
    const list = modulePicker(input, mods, {
      countEl: count,
      count: (n, total) => _t('%s/%s modules', n, total),
      extra: (m) => [m.latest_version && m.state === 'installed' && pill(m.latest_version),
        m.state !== 'installed' && pill(m.state, stateKind(m.state)), odooLink(state.origin, formPath(m.id))],
      shows: (m, q, picked) => picked || keep(m), // a ticked module shows whatever the filters
    });
    const refilter = () => { keep = moduleFilter(f); save(); bar.redraw(); input.dispatchEvent(new Event('input')); }; // the list redraws on input
    // by name: Odoo has several categories of one name under different parents (Point of Sale, Delivery…)
    const cats = [...new Set(mods.filter((m) => m.category_id).map((m) => m.category_id[1]))].sort((a, b) => a.localeCompare(b));
    const bar = searchBar(input, count, f, cats, refilter);

    /** A log line with its outcome on the right. */
    const step = (text) => {
      const outcome = el('span', { class: 'muted' }, _t('Running…'));
      log.append(el('li', { class: 'row' }, el('span', { class: 'grow' }, text), outcome));
      return { done: (label = '✓', kind = 'ok') => outcome.replaceWith(pill(label, kind)), fail: () => outcome.replaceWith(pill(_t('error'), 'err')) };
    };
    const reloadPage = () => { step(_t('Reloading the Odoo page…')); setTimeout(() => exec(() => location.reload()), 800); };

    const buttons = [];
    const action = (label, title, fn) => {
      const b = el('button', { class: 'btn', type: 'button', title }, label);
      b.addEventListener('click', async () => {
        const typed = splitList(input.value);
        log.replaceChildren();
        if (!typed.length) return log.append(el('li', {}, errBox(new Error(_t('Enter at least one module.')))));
        save();
        for (const x of buttons) x.disabled = true;
        let current = null;
        try {
          await fn(typed, (text) => (current = step(text)));
        } catch (e) {
          current?.fail();
          log.append(el('li', {}, errBox(e)));
        } finally {
          for (const x of buttons) x.disabled = false;
        }
      });
      buttons.push(b);
      return b;
    };

    const activate = action(_t('Activate'), _t('Update Apps List, then install every module (with its dependencies)'), async (typed, begin) => {
      let st = begin(_t('Update Apps List'));
      const [updated, added] = await call('ir.module.module', 'update_list');
      st.done(_t('%s updated · %s added', updated, added));
      const rows = await read(typed);
      const p = planInstall(typed, rows);
      if (p.missing.length) throw new Error(_t('Not found, even after Update Apps List: %s', p.missing.join(', ')));
      if (p.uninstallable.length) throw new Error(_t('Not installable: %s', names(p.uninstallable)));
      if (p.busy.length) throw new Error(_t('Waiting to be uninstalled: %s', names(p.busy)));
      if (p.installed.length) begin(_t('Already installed: %s', names(p.installed))).done();
      if (!p.install.length) return;
      st = begin(_t('Install %s', names(p.install)));
      await call('ir.module.module', 'button_immediate_install', [p.install.map((m) => m.id)]);
      st.done();
      reloadPage();
    });

    const upgrade = action(_t('Upgrade'), _t('Upgrade every module (they must be installed)'), async (typed, begin) => {
      const rows = await read(typed);
      const p = planUpgrade(typed, rows);
      if (p.missing.length) throw new Error(_t('Not found: %s', p.missing.join(', ')));
      if (p.notInstalled.length) throw new Error(_t('Not installed (use Activate): %s', names(p.notInstalled)));
      const st = begin(_t('Upgrade %s', names(p.upgrade)));
      await call('ir.module.module', 'button_immediate_upgrade', [p.upgrade.map((m) => m.id)]);
      st.done();
      reloadPage();
    });

    const open = action(_t('Open Forms ↗'), _t('Open the form of every module in a new tab'), async (typed, begin) => {
      const rows = await read(typed);
      const found = typed.map((name) => rows.find((m) => m.name === name)).filter(Boolean);
      const here = await chrome.tabs.get(tabId);
      for (const [i, m] of found.entries()) {
        await chrome.tabs.create({ url: `${state.origin}/odoo/${formPath(m.id)}`, index: here.index + 1 + i, openerTabId: tabId, active: false });
      }
      if (found.length) begin(_t('Opened %s tab(s): %s', found.length, names(found))).done();
      const missing = typed.filter((name) => !rows.some((m) => m.name === name));
      if (missing.length) throw new Error(_t('Not found: %s (Activate runs Update Apps List first)', missing.join(', ')));
    });

    const form = el('div', { class: 'form' },
      bar.el,
      list,
      el('div', { class: 'row mt fill' }, activate, upgrade, open),
      log);
    return el('div', { class: 'pad' }, form);
  });
}

/** Odoo's search bar: the active filters as facets inside it (× or Backspace in an empty input removes one), the input,
 * the count, and ▾ opening the filters (Installed / Not Installed, Apps / Extra) and the categories. `f` is changed in
 * place; onChange() after each change. */
function searchBar(input, count, f, cats, onChange) {
  const GROUPS = [ // a group is one facet, its ticked options joined by "or" (OR'ed, as in Odoo)
    { keys: [['installed', _t('Installed')], ['notInstalled', _t('Not Installed')]] },
    { keys: [['apps', _t('Apps')], ['extra', _t('Extra')]] },
  ];
  const facets = el('span', { class: 'facets' });
  const panel = el('div', { class: 'search-panel', hidden: true });
  const toggle = el('button', { type: 'button', class: 'search-toggle', title: _t('Filters'), 'aria-label': _t('Filters'), 'aria-expanded': 'false' }, '▾');
  const open = (on) => { panel.hidden = !on; toggle.setAttribute('aria-expanded', String(on)); if (on) redraw(); };
  toggle.addEventListener('click', () => open(panel.hidden));

  const item = (on, label, click) => el('button', { type: 'button', class: 'search-item', 'aria-pressed': String(on), onclick: click }, label);
  function redraw() {
    facets.replaceChildren(...[...GROUPS.map((g) => {
      const on = g.keys.filter(([k]) => f[k]);
      return on.length && facet(on.map(([, label]) => label).join(_t(' or ')), () => { for (const [k] of g.keys) f[k] = false; onChange(); });
    }), f.category && facet(`${_t('Category')}: ${f.category}`, () => { f.category = null; onChange(); })].filter(Boolean)); // elements only: Backspace takes the last
    if (panel.hidden) return;
    panel.replaceChildren(
      el('div', { class: 'search-col' }, el('div', { class: 'search-head' }, _t('Filters')),
        GROUPS.flatMap((g, i) => [i ? el('hr') : null, ...g.keys.map(([k, label]) => item(!!f[k], label, () => { f[k] = !f[k]; onChange(); }))])),
      el('div', { class: 'search-col cats' }, el('div', { class: 'search-head' }, _t('Category')),
        item(!f.category, _t('All Categories'), () => { f.category = null; onChange(); }),
        cats.map((name) => item(f.category === name, name, () => { f.category = f.category === name ? null : name; onChange(); }))));
  }
  const facet = (label, remove) => el('span', { class: 'facet' }, label,
    el('button', { type: 'button', class: 'facet-x', title: _t('Remove'), 'aria-label': _t('Remove'), onclick: remove }, '×'));

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Backspace' && !input.value && facets.lastChild) { ev.preventDefault(); facets.lastChild.querySelector('.facet-x').click(); }
    if (ev.key === 'Escape' && !panel.hidden) { ev.preventDefault(); open(false); }
  });
  const root = el('div', { class: 'searchbar' }, el('span', { class: 'search-icon', 'aria-hidden': 'true' }, '⌕'), facets, input, count, toggle, panel);
  document.addEventListener('pointerdown', (ev) => { if (!panel.hidden && !root.contains(ev.target)) open(false); });
  redraw();
  return { el: root, redraw };
}
