// Security tab: pick a user (yourself by default) and every card follows: groups (add / remove), ACLs, why an operation is
// allowed/blocked, hidden fields. Plus the logged-in session, system parameters and the model / instance audits.
// odoo.conf itself is never exposed over HTTP by Odoo: it holds admin_passwd and db_password.
import { rulesFor, modeVerdict, ruleEvalContext, auditModel, checkInstance, userRisks } from './logic.js';
import { pageEvalDomains, pageProbe } from './page.js';
import { MODES, pickGroupField } from '../../shared/odoo.js';
import { pageGo } from '../../shared/page.js';
import { exec, call, cached, uncache, sessionInfo, fieldsOf, readAcls, readRules, cookieFlags } from '../../shared/bridge.js';
import { el, pre, pill, triPill, details, empty, errBox, kv, block, expandable, filteredList, copyable, odooLink, listHead, splitRow } from '../../shared/ui.js';
import { _t, N_ } from '../../shared/i18n.js';

const KEY_GROUPS = ['group_system', 'group_erp_manager', 'group_no_one', 'group_user', 'group_portal', 'group_public'];
const LABEL = { high: N_('HIGH'), med: N_('MEDIUM'), low: N_('LOW'), info: N_('INFO') };
const LETTER = { read: 'R', write: 'W', create: 'C', unlink: 'D' };
// ponytail: key-name heuristic, the value still shows when the row is expanded
const SECRET = /secret|passw|token|api_?key|private_?key/i;
const targets = new Map(); // origin → simulated uid (none = the logged-in user); the panel moves between instances

const findings = (list) => list.length
  ? el('ul', { class: 'findings' }, list.map((f) => el('li', { class: f.level }, pill(_t(LABEL[f.level]), f.level), el('span', {}, f.msg))))
  : el('div', { class: 'okline' }, _t('✓ No issue found.'));

/** The simulated user: profile, groups (implied included), the writable group field `wf`, base group xmlids. */
async function loadTarget(origin) {
  const [info, ufields] = await Promise.all([sessionInfo(), fieldsOf('res.users')]);
  const uid = targets.get(origin) ?? info.uid;
  const gf = pickGroupField(ufields);
  const wf = ['group_ids', 'groups_id'].find((f) => f in ufields); // 19: all_group_ids is computed, group_ids holds the direct ones
  const opt = ['totp_enabled', 'api_key_ids', 'employee_id', 'employee_ids'].filter((f) => f in ufields);
  const [[u], users, xml] = await Promise.all([
    call('res.users', 'read', [[uid], ['name', 'login', 'active', 'share', 'partner_id', 'company_id', 'company_ids', gf, wf !== gf && wf, ...opt].filter(Boolean)],
      { context: { active_test: false } }),
    cached('users', () => call('res.users', 'search_read', [[]], { fields: ['name', 'login', 'share'], order: 'share, name', limit: 1000 })), // ponytail: first 1000 active users
    cached('key groups', () => call('ir.model.data', 'search_read',
      [[['module', '=', 'base'], ['model', '=', 'res.groups'], ['name', 'in', KEY_GROUPS]]], { fields: ['name', 'res_id'] })),
  ]);
  const [p] = await call('res.partner', 'read', [[u.partner_id[0]], ['commercial_partner_id']]).catch(() => [{}]);
  u.commercial_partner_id = p.commercial_partner_id?.[0] || u.partner_id[0];
  const groupIds = new Set(u[gf] || []);
  const groupXml = new Map(xml.map((x) => [x.res_id, `base.${x.name}`]));
  const has = (name) => xml.some((x) => x.name === name && groupIds.has(x.res_id));
  return { me: info.uid, uid, u, wf, users, groupIds, groupXml, has };
}

/** Opens an incognito window on Odoo's login page for `login`, landing back on `url` once logged in: this session is
 * untouched (incognito has its own cookies). */
async function openIncognito(origin, db, login, url) {
  const { pathname, search, hash } = new URL(url);
  const target = `${origin}/web/login?${new URLSearchParams({ db, login, redirect: pathname + search + hash })}`;
  if (!(await chrome.extension.isAllowedIncognitoAccess())) {
    await chrome.windows.create({ incognito: true, url: target }); // opens, but resolves to null: not our window to see
    return;
  }
  // Incognito windows share one session: with a user still logged in there, /web/login?redirect= would skip the login.
  const { tabs: [tab] } = await chrome.windows.create({ incognito: true, url: 'about:blank' });
  try {
    const store = (await chrome.cookies.getAllCookieStores()).find((st) => st.tabIds.includes(tab.id));
    if (store) await chrome.cookies.remove({ url: origin, name: 'session_id', storeId: store.id });
  } finally {
    await chrome.tabs.update(tab.id, { url: target }); // the login page opens even if the cookie could not be dropped
  }
}

/** Switch to the picked user in an incognito window (their password is typed on Odoo's login page; this tab stays
 * yours). With OCA impersonate_login, impersonating in this very session is offered too. */
function switchBox(t, state) {
  const { origin, url } = state;
  const box = el('div', { class: 'switch mt' });
  const fail = (e) => box.append(errBox(e));
  const reload = () => { targets.delete(origin); exec(pageGo, url); }; // the webclient restarts as the new user
  Promise.all([t, sessionInfo(), chrome.extension.isAllowedIncognitoAccess()]).then(([{ uid, me, u }, info, clean]) => {
    if (info.impersonate_from_uid) { // impersonate_login: this session is someone else's for now
      box.append(el('div', { class: 'row' }, el('button', { class: 'btn', onclick: () => call('res.users', 'back_to_origin_login').then(reload, fail) }, _t('Back to My User'))),
        el('div', { class: 'note' }, _t('This session is impersonating %s (Impersonate Login).', info.name)));
    }
    if (uid === me) return box.append(el('div', { class: 'note' }, _t('Pick another user above to open a session as them.')));
    box.append(el('div', { class: 'row' },
      el('button', {
        class: 'btn', title: _t('Incognito window on this page, logged in as %s', u.login),
        onclick: () => openIncognito(origin, info.db, u.login, url).catch(fail),
      }, _t('Switch to This User')),
      info.is_impersonate_user && !info.impersonate_from_uid ? el('button', {
        class: 'chip', title: _t('Impersonate Login module: no password, but this session (every tab of this Odoo) becomes %s', u.login),
        onclick: () => confirm(_t('Log this session in as %s? Every tab of this Odoo switches too.', u.name))
          && call('res.users', 'impersonate_login', [[uid]]).then(reload, fail),
      }, _t('Impersonate in This Session')) : null),
    el('div', { class: 'note' }, _t('Opens an incognito window on this page, at the login of %s: type their password there. This session stays yours.', u.login)));
    // not in box.append() above: the DOM append prints a null as "null" (only el() skips it)
    if (!clean) box.append(el('div', { class: 'note' }, _t('Incognito windows share one session: close those already open on this Odoo first, or allow this extension in incognito (chrome://extensions) so each switch starts clean.')));
  }, () => {});
  return box;
}

export function renderSecurity(s, state) {
  const { model, resId, origin } = state;
  const t = loadTarget(origin);
  const rerender = () => { s.replaceChildren(); renderSecurity(s, state); };

  const picker = el('select', { 'aria-label': _t('Simulated user'), onchange: () => { targets.set(origin, +picker.value); rerender(); } },
    el('option', {}, _t('Loading users…')));
  block(s, 'view-as', _t('View as user'), () => el('div', {},
    el('div', { class: 'picker' }, picker,
      el('button', { class: 'chip', onclick: () => { targets.delete(origin); rerender(); } }, _t('My User'))),
    el('div', { class: 'note' }, _t('Simulates the selected user\'s rights without logging in as them (reading other users\' groups needs admin rights).')),
    switchBox(t, state),
    el('div', { class: 'mt' }, el('button', {
      class: 'btn', title: _t('Odoo\'s built-in /web/become route, base.group_system only'),
      onclick: () => confirm(_t('Switch the current session to superuser (bypasses every rule)?')) && exec(pageGo, '/web/become'),
    }, _t('Become Superuser')))));
  t.then(({ uid, me, users }) => {
    const list = users.some((x) => x.id === uid) ? users : [{ id: uid, name: `#${uid}`, login: '' }, ...users]; // users is cached: don't mutate
    picker.replaceChildren(...list.map((x) => el('option', { value: x.id, selected: x.id === uid },
      `${x.name}${x.login ? ` (${x.login})` : ''}${x.share ? ' · portal' : ''}${x.id === me ? ` · ${_t('me')}` : ''}`)));
  }, () => picker.replaceChildren(el('option', {}, _t('Cannot read the user list'))));

  block(s, 'session', _t('Session'), async () => {
    const i = await sessionInfo();
    return el('div', {},
      kv({
        user: `${i.name} (#${i.uid})`, login: i.username, db: i.db, version: i.server_version, admin: i.is_admin, system: i.is_system,
        'web.base.url': i['web.base.url'] || '—', test_mode: !!i.test_mode, // test_mode = odoo.conf test_enable
      }),
      details('user_context', pre(i.user_context)), details(_t('Companies'), pre(i.user_companies)));
  });

  block(s, 'user-risks', _t('User risks'), async () => {
    const { u, has, groupIds } = await t;
    return el('div', {},
      el('div', { class: 'muted pad-top' },
        _t('%s · %s · #%s · %s (%s companies) · %s groups', u.name, u.login, u.id, u.company_id?.[1] || '', u.company_ids.length, groupIds.size)),
      findings(userRisks(u, has)));
  });

  block(s, 'groups', _t('Groups'), () => groupsBlock(t, rerender));

  if (model) {
    block(s, 'effective', _t('Effective access on %s', `${model}${resId ? ` #${resId}` : ''}`), async () => {
      const { uid, me } = await t;
      if (uid !== me) return empty(_t('has_access runs as the logged-in user only: see Why allowed / blocked for the selected user.'));
      const res = await Promise.all(MODES.map((op) => call(model, 'has_access', [resId ? [resId] : [], op]).catch(() => null)));
      return el('div', { class: 'row' }, MODES.map((op, i) => triPill(res[i], [`✓ ${op}`, `✗ ${op}`, `? ${op}`])));
    });

    const modelSec = Promise.all([readAcls(model), readRules(model), fieldsOf(model)]);

    block(s, 'why', _t('Why allowed / blocked — %s', `${model}${resId ? ` #${resId}` : ''}`), () => whyBlock(model, resId, t, modelSec));

    block(s, 'acl', _t('ACL (ir.model.access) — green = applies to the user'), async () => {
      const [{ groupIds }, [rows]] = await Promise.all([t, modelSec]);
      if (!rows.length) return empty(_t('No ACL.'));
      return el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, _t('ACL / group')), MODES.map((m) => el('th', { class: 'c' }, LETTER[m])))),
        el('tbody', {}, rows.map((a) => el('tr', { class: !a.group_id || groupIds.has(a.group_id[0]) ? 'mine' : '' },
          el('td', {}, a.name, el('div', { class: 'muted' }, a.group_id ? a.group_id[1] : _t('(all users)'))),
          MODES.map((m) => el('td', { class: 'c' }, a[`perm_${m}`] ? '✓' : ''))))));
    });

    block(s, 'hidden-fields', _t('Fields hidden from the user (groups=)'), async () => {
      const [{ uid }, [, , fields]] = await Promise.all([t, modelSec]);
      const restricted = Object.entries(fields).filter(([, f]) => f.groups);
      if (!restricted.length) return empty(_t('No field declares groups=.'));
      const specs = [...new Set(restricted.map(([, f]) => f.groups))];
      const ok = new Map(await Promise.all(specs.map(async (sp) => [sp, await call('res.users', 'has_groups', [[uid], sp]).catch(() => null)])));
      restricted.sort(([, a], [, b]) => Number(ok.get(a.groups)) - Number(ok.get(b.groups)));
      return el('div', {}, listHead(_t('Field · label · for this user'), 'groups='), el('ul', { class: 'list' }, restricted.map(([name, f]) => expandable(el('li', {},
        el('div', { class: 'row' }, copyable(name), el('span', { class: 'grow muted' }, f.string),
          triPill(ok.get(f.groups), [_t('visible'), _t('hidden'), '?'])),
        el('div', { class: 'meta' }, f.groups))))));
    });

    block(s, 'model-audit', _t('Model configuration audit'), async () => {
      const [{ groupXml }, [acls, rules, fields]] = await Promise.all([t, modelSec]);
      return findings(auditModel({ fields, acls, rules, groupXml }));
    });
  }

  // base.group_system only: say so instead of showing an AccessError.
  block(s, 'params', _t('System parameters (ir.config_parameter)'), async () => {
    if (!(await sessionInfo()).is_system) return empty(_t('Needs Settings rights (base.group_system).'));
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
  });

  block(s, 'instance', _t('Instance check'), async () => {
    const [probe, cookie] = await cached('probe', async () => {
      const r = await Promise.all([exec(pageProbe), cookieFlags(state.url)]);
      if (!r[0] || r[0].error) throw new Error(r[0]?.error || _t('Check failed'));
      return r;
    });
    return el('div', {}, findings(checkInstance(probe, cookie)),
      el('div', { class: 'pad-bottom' },
        details(_t('Raw data'), pre({ ...probe, cookie })),
        el('button', { class: 'chip mt', onclick: () => { uncache('probe'); rerender(); } }, _t('Check Again'))));
  });
}

/** The user's groups, implied included, then (while filtering) the groups they don't have: add one, or remove a group
 * nothing else implies (removing an implied one is undone by Odoo). Writing needs Access Rights (base.group_erp_manager). */
async function groupsBlock(t, rerender) {
  const { uid, u, wf, groupIds } = await t;
  const gfields = await fieldsOf('res.groups');
  const impf = ['all_implied_ids', 'trans_implied_ids'].find((f) => f in gfields); // 19 / 18
  const all = await cached('all groups', () => call('res.groups', 'search_read', [[]], { fields: ['full_name', impf], order: 'full_name' }));
  const impliedBy = new Map(); // group id → names of the user's other groups implying it
  for (const g of all) {
    if (!groupIds.has(g.id)) continue;
    for (const h of g[impf]) if (h !== g.id) impliedBy.set(h, [...(impliedBy.get(h) || []), g.full_name]); // 19 counts the group itself
  }
  const box = el('div', {});
  const edit = (msg, cmd) => confirm(msg) && call('res.users', 'write', [[uid], { [wf]: [cmd] }]).then(rerender, (e) => box.append(errBox(e)));
  const row = (g, held) => {
    const by = impliedBy.get(g.id);
    const action = !held
      ? el('button', { class: 'chip', onclick: () => edit(_t('Add %s to %s?', g.full_name, u.name), [4, g.id]) }, _t('+ Add'))
      : by ? pill(_t('implied')) : el('button', { class: 'chip', onclick: () => edit(_t('Remove %s from %s?', g.full_name, u.name), [3, g.id]) }, _t('Remove'));
    if (by) action.title = _t('Implied by %s', by.join(', '));
    const li = el('li', { class: held ? '' : 'addable' }, splitRow(el('span', {}, g.full_name), action));
    li.dataset.q = g.full_name.toLowerCase();
    return { li, held };
  };
  const rows = [...all.filter((g) => groupIds.has(g.id)).map((g) => row(g, true)), ...all.filter((g) => !groupIds.has(g.id)).map((g) => row(g, false))];
  const held = rows.filter((r) => r.held).length;
  const count = el('span', { class: 'muted' }, _t('%s groups', held));
  const input = el('input', {
    type: 'search', placeholder: _t('Filter or add a group…'), 'aria-label': _t('Filter or add a group…'),
    oninput: () => {
      const q = input.value.trim().toLowerCase();
      for (const r of rows) r.li.hidden = !r.li.dataset.q.includes(q) || (!r.held && !q); // groups to add: only while searching
      count.textContent = q ? _t('%s/%s groups', rows.filter((r) => r.held && !r.li.hidden).length, held) : _t('%s groups', held);
    },
  });
  for (const r of rows) r.li.hidden = !r.held;
  box.append(el('div', { class: 'toolbar' }, input, count), el('ul', { class: 'list groups' }, rows.map((r) => r.li)));
  return box;
}

async function whyBlock(model, resId, t, modelSec) {
  const [{ u, groupIds }, [acls, rules]] = await Promise.all([t, modelSec]);
  const modesOf = (r) => MODES.filter((m) => rulesFor([r], groupIds, m).length);
  const relevant = rules.filter((r) => modesOf(r).length);
  const evals = await exec(pageEvalDomains, relevant.map((r) => r.domain_force), ruleEvalContext(u));
  const evaluated = new Map(); // ruleId → domain, evaluated for the simulated user
  const passed = new Map(); // ruleId → the record matches it
  const note = new Map(); // ruleId → why it could not be checked
  // filtered_domain is @api.private (not callable over RPC), so test each domain with search_count.
  // ponytail: runs under the viewer's own rules; if the viewer can't see the record, nothing can be checked.
  const count = (dom) => call(model, 'search_count', [[['id', '=', resId], ...dom]], { context: { active_test: false } });
  const visible = resId ? await count([]).catch(() => 0) : 0;
  await Promise.all(relevant.map(async (r, i) => {
    const ev = (Array.isArray(evals) && evals[i]) || { error: evals?.error || N_('no result') };
    if (ev.error) return note.set(r.id, _t('cannot evaluate: %s', _t(ev.error)));
    evaluated.set(r.id, ev.domain);
    if (!resId) return;
    if (!visible) return note.set(r.id, _t('You cannot read this record yourself, so its rules cannot be checked.'));
    try { passed.set(r.id, (await count(ev.domain)) > 0); } catch (e) { note.set(r.id, e.message); }
  }));

  const gids = [...new Set(rules.flatMap((r) => r.groups))];
  const gname = new Map((gids.length ? await call('res.groups', 'read', [gids, ['full_name']]) : []).map((g) => [g.id, g.full_name]));

  const verdict = el('div', { class: 'verdict' }, MODES.map((mode) => {
    const { ok, why } = modeVerdict({ u, groupIds, acls, rules, mode, resId, passed });
    return el('div', { class: ok === true ? 'allow' : ok === false ? 'deny' : '' },
      el('div', { class: 'row' }, el('b', {}, mode), el('span', { class: 'grow' }),
        triPill(ok, [_t('ALLOWED'), _t('BLOCKED'), _t('UNKNOWN')], 'med')),
      el('div', { class: 'why' }, why));
  }));

  const ruleItems = rules.map((r) => {
    const modes = modesOf(r).map((m) => LETTER[m]).join('');
    return expandable(el('li', { class: modes ? '' : 'inactive' },
      el('div', { class: 'row' }, el('span', { class: 'grow' }, el('b', {}, r.name)),
        modes ? pill(modes, 'accent') : pill(_t('not applicable')),
        modes && resId ? triPill(note.has(r.id) ? null : passed.get(r.id), undefined, 'med') : null),
      el('div', { class: 'meta' }, r.global ? 'global' : r.groups.map((g) => gname.get(g) || g).join(', ')),
      el('div', { class: 'meta mono' }, r.domain_force || '[]'),
      evaluated.has(r.id) ? el('div', { class: 'mono' }, `→ ${JSON.stringify(evaluated.get(r.id))}`) : null,
      note.has(r.id) ? el('div', { class: 'error' }, note.get(r.id)) : null));
  });

  return el('div', {}, verdict,
    rules.length ? el('div', {}, listHead(_t('Rule · operations · result'), _t('Groups · domain')), el('ul', { class: 'list' }, ruleItems))
      : empty(_t('This model has no record rule.')),
    el('p', { class: 'note pad-bottom' },
      _t('Assumes the user selected every allowed company. Rules of parent models through _inherits are not counted. This is a simulation; for an exact answer about yourself, see Effective access (has_access runs on the server).')));
}
