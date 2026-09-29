// Apps tab: for a typed list of modules, Activate (Update Apps List, then install them all), Upgrade, or open their
// forms in new tabs. Same server methods as Odoo's Apps menu; install / upgrade then reload the Odoo page.
// Below: every installed module, filterable.
import { planInstall, planUpgrade, stateKind } from './logic.js';
import { splitList } from '../translations/logic.js';
import {
  exec, tabId, call, sessionInfo, installedModules, el, pill, empty, block, errBox, copyable, odooLink, splitRow, expandable, filteredList, listHead,
  formValues, saveForm,
} from '../../shared/ui.js';
import { _t, N_ } from '../../shared/i18n.js';

const read = (names) => call('ir.module.module', 'search_read', [[['name', 'in', names]]], { fields: ['name', 'shortdesc', 'state', 'latest_version'] });
const formPath = (id) => `action-base.open_module_tree/${id}`; // the Apps action: its breadcrumb leads back to Apps
const names = (list) => list.map((m) => m.name).join(', ');
const needsAdmin = () => empty(_t('Needs Settings rights (base.group_system).'));

export function renderApps(s, state) {
  block(s, 'modules', _t('Modules'), async () => {
    if (!(await sessionInfo()).is_system) return needsAdmin();
    const input = el('input', { type: 'text', placeholder: 'sale; stock; my_module', value: formValues('apps').modules || '', spellcheck: false });
    const status = el('ul', { class: 'list' });
    const log = el('ul', { class: 'steps' });

    /** One row per typed module: title, version, state, ↗ to its form. */
    const show = (typed, rows) => {
      const byName = new Map(rows.map((m) => [m.name, m]));
      status.replaceChildren(...typed.map((name) => {
        const m = byName.get(name);
        return el('li', {}, m
          ? splitRow([copyable(name), el('span', { class: 'grow muted' }, m.shortdesc), m.latest_version && pill(m.latest_version), pill(m.state, stateKind(m.state))],
            odooLink(state.origin, formPath(m.id)))
          : el('div', { class: 'row' }, copyable(name), el('span', { class: 'grow' }), pill(_t('not found'), 'err')));
      }));
    };
    const refreshStatus = async () => {
      const typed = splitList(input.value);
      if (!typed.length) return status.replaceChildren();
      show(typed, await read(typed));
    };
    input.addEventListener('change', () => refreshStatus().catch(() => {})); // Enter or leaving the field

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
        saveForm('apps', { modules: input.value });
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
      show(typed, rows);
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
      show(typed, rows);
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
      show(typed, rows);
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
      el('label', {}, _t('Modules'), input),
      el('div', { class: 'note' }, _t('Technical names, separated by ;')),
      el('div', { class: 'row mt' }, activate, upgrade, open),
      el('div', { class: 'note' }, _t('Activate runs Update Apps List first. Install and upgrade reload the Odoo page when done.')),
      log);
    await refreshStatus().catch(() => {}); // after a reload: the state each module ended in
    return el('div', {}, el('div', { class: 'pad' }, form), status);
  });

  block(s, 'installed', _t('Installed modules'), async () => {
    if (!(await sessionInfo()).is_system) return needsAdmin();
    const mods = await installedModules();
    const items = mods.map((m) => {
      const li = el('li', {},
        splitRow([copyable(m.name), el('span', { class: 'grow muted' }, m.shortdesc), m.latest_version && pill(m.latest_version)],
          odooLink(state.origin, formPath(m.id))),
        m.author ? el('div', { class: 'meta' }, m.author) : null);
      li.dataset.q = `${m.name} ${m.shortdesc} ${m.author || ''}`.toLowerCase();
      return expandable(li);
    });
    return filteredList(items, _t('Filter name / title / author'), N_('%s modules'), N_('%s/%s modules'),
      listHead(_t('Module · title · version'), _t('Author')));
  });
}
