// Security tab: simulate another user's rights, explain why an operation is allowed/blocked, audit model & instance.
import { rulesFor, modeVerdict, ruleEvalContext, auditModel, checkInstance, userRisks } from './logic.js';
import { pageEvalDomains, pageProbe } from './page.js';
import { MODES, pickGroupField } from '../../shared/odoo.js';
import { pageGo } from '../../shared/page.js';
import {
  exec, call, cached, uncache, sessionInfo, fieldsOf, readAcls, readRules, cookieFlags,
  el, pre, pill, triPill, details, empty, errBox, block, expandable, copyable, listHead,
} from '../../shared/ui.js';
import { _t, N_ } from '../../shared/i18n.js';

const KEY_GROUPS = ['group_system', 'group_erp_manager', 'group_no_one', 'group_user', 'group_portal', 'group_public'];
const LABEL = { high: N_('HIGH'), med: N_('MEDIUM'), low: N_('LOW'), info: N_('INFO') };
const LETTER = { read: 'R', write: 'W', create: 'C', unlink: 'D' };
const targets = new Map(); // origin → simulated uid (none = the logged-in user); the panel moves between instances

const findings = (list) => list.length
  ? el('ul', { class: 'findings' }, list.map((f) => el('li', { class: f.level }, pill(_t(LABEL[f.level]), f.level), el('span', {}, f.msg))))
  : el('div', { class: 'okline' }, _t('✓ No issue found.'));

/** The simulated user: profile, groups (implied included), base group xmlids. */
async function loadTarget(origin) {
  const [info, ufields] = await Promise.all([sessionInfo(), fieldsOf('res.users')]);
  const uid = targets.get(origin) ?? info.uid;
  const gf = pickGroupField(ufields);
  const opt = ['totp_enabled', 'api_key_ids', 'employee_id', 'employee_ids'].filter((f) => f in ufields);
  const [[u], users, xml] = await Promise.all([
    call('res.users', 'read', [[uid], ['name', 'login', 'active', 'share', 'partner_id', 'company_id', 'company_ids', gf, ...opt].filter(Boolean)],
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
  return { me: info.uid, uid, u, users, groupIds, groupXml, has };
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

  block(s, 'user-risks', _t('User risks'), async () => {
    const { u, has, groupIds } = await t;
    return el('div', {},
      el('div', { class: 'muted pad-top' },
        _t('%s · %s · #%s · %s (%s companies) · %s groups', u.name, u.login, u.id, u.company_id?.[1] || '', u.company_ids.length, groupIds.size)),
      findings(userRisks(u, has)));
  });

  if (model) {
    const modelSec = Promise.all([readAcls(model), readRules(model), fieldsOf(model)]);

    block(s, 'why', _t('Why allowed / blocked — %s', `${model}${resId ? ` #${resId}` : ''}`), () => whyBlock(model, resId, t, modelSec));

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
      _t('Assumes the user selected every allowed company. Rules of parent models through _inherits are not counted. This is a simulation; for an exact answer about yourself, see the Access tab (has_access runs on the server).')));
}
