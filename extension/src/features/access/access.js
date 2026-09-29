// Access tab: the logged-in session, effective rights on the current model/record, ACLs, record rules, groups,
// and the instance configuration a browser can reach (system parameters, installed modules). odoo.conf itself is
// never exposed over HTTP by Odoo: it holds admin_passwd and db_password.
import { MODES, pickGroupField } from '../../shared/odoo.js';
import {
  call, cached, sessionInfo, fieldsOf, readAcls, readRules,
  el, pre, pill, triPill, details, empty, kv, block, expandable, filterBox, copyable, odooLink, listHead, splitRow,
} from '../../shared/ui.js';
import { _t, N_ } from '../../shared/i18n.js';

/** The logged-in user's groups (implied included), full_name only. */
const myGroups = () => cached('my groups', async () => {
  const [{ uid }, ufields] = await Promise.all([sessionInfo(), fieldsOf('res.users')]);
  const f = pickGroupField(ufields);
  if (!f) return [];
  const [u] = await call('res.users', 'read', [[uid], [f]]);
  return call('res.groups', 'read', [u[f], ['full_name']]);
});

// ponytail: key-name heuristic, the value still shows when the row is expanded
const SECRET = /secret|passw|token|api_?key|private_?key/i;

/** Filterable list with a count. items: <li> with data-q. total / visible: N_ msgids with %s and %s/%s. head: listHead(). */
function filteredList(items, placeholder, total, visible, head) {
  const count = el('span', { class: 'muted' }, _t(total, items.length));
  return el('div', {},
    el('div', { class: 'toolbar' }, filterBox(items, placeholder, (n) => { count.textContent = _t(visible, n, items.length); }), count, head),
    el('ul', { class: 'list' }, items));
}

export function renderAccess(s, state) {
  const { model, resId, origin } = state;
  const groupIds = myGroups().then((gs) => new Set(gs.map((g) => g.id)), () => new Set());

  block(s, 'session', _t('Session'), async () => {
    const i = await sessionInfo();
    return el('div', {},
      kv({
        user: `${i.name} (#${i.uid})`, login: i.username, db: i.db, version: i.server_version, admin: i.is_admin, system: i.is_system,
        'web.base.url': i['web.base.url'] || '—', test_mode: !!i.test_mode, // test_mode = odoo.conf test_enable
      }),
      details('user_context', pre(i.user_context)), details(_t('Companies'), pre(i.user_companies)));
  });

  if (model) {
    block(s, 'effective', _t('Effective access on %s', `${model}${resId ? ` #${resId}` : ''}`), async () => {
      const res = await Promise.all(MODES.map((op) => call(model, 'has_access', [resId ? [resId] : [], op]).catch(() => null)));
      return el('div', { class: 'row' }, MODES.map((op, i) => triPill(res[i], [`✓ ${op}`, `✗ ${op}`, `? ${op}`])));
    });

    const perm = (x) => MODES.map((m) => el('td', { class: 'c' }, x[`perm_${m}`] ? '✓' : ''));
    const rwcd = () => ['R', 'W', 'C', 'D'].map((h) => el('th', { class: 'c' }, h));
    block(s, 'acl', _t('ACL (ir.model.access) — green = applies to you'), async () => {
      const [rows, mine] = await Promise.all([readAcls(model), groupIds]);
      if (!rows.length) return empty(_t('No ACL.'));
      return el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, _t('ACL / group')), rwcd())), el('tbody', {}, rows.map((a) =>
        el('tr', { class: !a.group_id || mine.has(a.group_id[0]) ? 'mine' : '' },
          el('td', {}, a.name, el('div', { class: 'muted' }, a.group_id ? a.group_id[1] : _t('(all users)'))), perm(a)))));
    });

    block(s, 'rules', _t('Record rules (ir.rule) — green = applies to you'), async () => {
      const [rows, mine] = await Promise.all([readRules(model), groupIds]);
      if (!rows.length) return empty(_t('No record rule.'));
      return el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, _t('Rule / domain')), rwcd())), el('tbody', {}, rows.map((r) =>
        el('tr', { class: r.global || r.groups.some((g) => mine.has(g)) ? 'mine' : '' },
          el('td', {}, r.name, r.global ? ' ' : null, r.global ? pill('global', 'info') : null,
            el('div', { class: 'mono muted' }, r.domain_force)), perm(r)))));
    });
  }

  block(s, 'groups', _t('Your groups'), async () => {
    const gs = await myGroups();
    return gs.length ? details(_t('%s groups', gs.length), pre(gs.map((g) => g.full_name).sort().join('\n'))) : empty(_t('No group.'));
  });

  // Both models are base.group_system only: say so instead of showing an AccessError.
  const adminOnly = async (fn) => ((await sessionInfo()).is_system ? fn() : empty(_t('Needs Settings rights (base.group_system).')));

  block(s, 'params', _t('System parameters (ir.config_parameter)'), () => adminOnly(async () => {
    const rows = await call('ir.config_parameter', 'search_read', [[]], { fields: ['key', 'value'], order: 'key' }); // not cached: edited while debugging
    const items = rows.map((p) => {
      const secret = SECRET.test(p.key);
      const li = el('li', {},
        splitRow(copyable(p.key), odooLink(origin, `ir.config_parameter/${p.id}`)),
        el('div', { class: 'meta mono' }, p.value ? copyable(p.value, '', secret ? '••••••' : p.value) : '')); // copies the real value, even masked
      li.dataset.q = `${p.key} ${secret ? '' : p.value}`.toLowerCase();
      return expandable(li, () => pre(p.value));
    });
    return items.length ? filteredList(items, _t('Filter key / value'), N_('%s parameters'), N_('%s/%s parameters'), listHead(_t('Key'), _t('Value'))) : empty(_t('No parameter.'));
  }));

  block(s, 'modules', _t('Installed modules'), () => adminOnly(async () => {
    // latest_version = the version installed in the DB (installed_version is computed from the manifest on disk: slow)
    const mods = await cached('modules', () => call('ir.module.module', 'search_read', [[['state', '=', 'installed']]],
      { fields: ['name', 'shortdesc', 'latest_version', 'author'], order: 'name' }));
    const items = mods.map((m) => {
      const li = el('li', {},
        splitRow([copyable(m.name), el('span', { class: 'grow muted' }, m.shortdesc), m.latest_version && pill(m.latest_version)],
          odooLink(origin, `ir.module.module/${m.id}`)),
        m.author ? el('div', { class: 'meta' }, m.author) : null);
      li.dataset.q = `${m.name} ${m.shortdesc} ${m.author || ''}`.toLowerCase();
      return expandable(li);
    });
    return filteredList(items, _t('Filter name / title / author'), N_('%s modules'), N_('%s/%s modules'),
      listHead(_t('Module · title · version'), _t('Author')));
  }));
}
