// Shared panel helpers: talking to the inspected tab, cached reads, a tiny DOM builder.
import { pageRpc } from './page.js';
import { MODES } from './odoo.js';
import { _t } from './i18n.js';

export let tabId = null;
export const setTab = (t) => { tabId = t?.id ?? null; };
export const $ = (s) => document.querySelector(s);

/** Runs a self-contained page function in the tab's MAIN world, reusing the Odoo session. */
export async function exec(func, ...args) {
  if (tabId == null) return { error: _t('No tab is open.') };
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args });
    return r?.result ?? null;
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

/** exec() for page functions returning { error } with an N_-marked msgid: throws the translated message. */
export async function execOrThrow(func, fallback, ...args) {
  const r = await exec(func, ...args);
  if (!r || r.error) throw new Error(_t(r?.error || fallback));
  return r;
}

export async function rpc(route, params) {
  const r = await exec(pageRpc, route, params);
  if (!r) throw new Error(_t('No response — is this an Odoo page?'));
  if (r.error) throw Object.assign(new Error(r.error), { traceback: r.traceback });
  return r.result;
}
export const call = (model, method, args = [], kwargs = {}) =>
  rpc(`/web/dataset/call_kw/${model}/${method}`, { model, method, args, kwargs });

// ---------- cached reads: data that only changes on a page load, kept until then (or ⟳), shared by every tab ----------
const cache = new Map();
export function cached(key, fn) {
  if (!cache.has(key)) {
    const p = fn();
    p.catch(() => cache.get(key) === p && cache.delete(key)); // a failure is retried on the next render
    cache.set(key, p);
  }
  return cache.get(key);
}
export const uncache = (key) => cache.delete(key);
export const clearCache = () => cache.clear();

const FIELD_ATTRS = ['string', 'type', 'relation', 'store', 'depends', 'related', 'readonly', 'required', 'groups'];
export const sessionInfo = () => cached('session', () => rpc('/web/session/get_session_info', {}));
export const fieldsOf = (model) => cached(`fields ${model}`, () => call(model, 'fields_get', [], { attributes: FIELD_ATTRS }));

// ACLs and rules are not cached: they are what people edit while debugging.
const PERMS = MODES.map((m) => `perm_${m}`);
const ofModel = (model) => [[['model_id.model', '=', model]]];
export const readAcls = (model) => call('ir.model.access', 'search_read', ofModel(model), { fields: ['name', 'group_id', ...PERMS] });
export const readRules = (model) => call('ir.rule', 'search_read', ofModel(model), { fields: ['name', 'groups', 'domain_force', 'global', ...PERMS] });

/** session_id cookie flags only: the token value never leaves this function. */
export async function cookieFlags(url) {
  try {
    const c = await chrome.cookies.get({ url, name: 'session_id' });
    return c && { httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite, session: c.session };
  } catch {
    return null;
  }
}

// DOM builder: text only goes through textContent, Odoo data never touches innerHTML.
export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role') n.setAttribute(k, v);
    else n[k] = v;
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k instanceof Node ? k : String(k));
  return n;
}
export const pre = (o) => el('pre', {}, typeof o === 'string' ? o : JSON.stringify(o, null, 2));
/** Collapsible section, closed until its summary is clicked (every one in the panel starts closed). */
export const details = (summary, ...kids) => el('details', {}, el('summary', {}, summary), ...kids);
export const errBox = (e) => el('div', { class: 'error' }, e.message, e.traceback ? details(_t('Traceback'), pre(e.traceback)) : null);
export const pill = (text, kind = '') => el('span', { class: `pill ${kind}` }, text);
/** true / false / anything else (unknown) → green / red / `unknownKind` pill with the matching label. */
export const triPill = (v, [yes, no, unknown] = ['✓', '✗', '?'], unknownKind = '') =>
  v === true ? pill(yes, 'ok') : v === false ? pill(no, 'err') : pill(unknown, unknownKind);
export const empty = (msg) => el('div', { class: 'empty' }, msg);
export const kv = (obj) => el('dl', { class: 'kv' }, Object.entries(obj).flatMap(([k, v]) =>
  [el('dt', {}, k), el('dd', {}, v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))]));

/** Opens /odoo/<path> (e.g. res.partner/7) of the inspected Odoo in a new tab (the inspected tab stays put). */
export const odooLink = (origin, path, text = '↗') => el('a', {
  class: 'btn', href: `${origin}/odoo/${path}`, target: '_blank', rel: 'noopener', title: _t('Open /odoo/%s', path),
}, text);

/** A list row in two columns: `info` on the left (wraps as needed), `actions` (↗ buttons…) on the right, lined up on every row. */
export const splitRow = (info, ...actions) => el('div', { class: 'row split' },
  el('div', { class: 'row grow' }, info), el('div', { class: 'actions' }, actions));

/** Column names of a .list, shown only when the list is laid out as a table (wide panel, see panel.css). */
export const listHead = (main, desc) => el('div', { class: 'list-head', 'aria-hidden': 'true' }, el('span', {}, main), el('span', {}, desc));

// Cards start closed; the ones opened stay open across re-renders and reloads (localStorage of the panel, every instance).
const OPEN_CARDS = 'odoo-debug-open-cards';
const openCards = () => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_CARDS)) || []); } catch { return new Set(); } };
function rememberCard(id, open) {
  const ids = openCards();
  if (open) ids.add(id); else ids.delete(id);
  try { localStorage.setItem(OPEN_CARDS, JSON.stringify([...ids])); } catch { /* storage off: every card starts closed */ }
}

/** A collapsible card of the tab `parent`, remembered as `<tab>:<key>` (key: stable, the title is translated / dynamic).
 * Its body is built the first time it opens (`fn` may be async); a failing card (e.g. no ACL on ir.rule) doesn't blank the others. */
export function block(parent, key, title, fn) {
  const id = `${parent.id}:${key}`;
  const body = el('div', { class: 'card-body' });
  const c = el('details', { class: 'card' }, el('summary', {}, el('h3', {}, title)), body);
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    body.replaceChildren(el('div', { class: 'loading' }, _t('Loading…')));
    Promise.resolve().then(fn).then((n) => body.replaceChildren(...[n].filter(Boolean)), (e) => body.replaceChildren(errBox(e)));
  };
  c.addEventListener('toggle', () => { rememberCard(id, c.open); if (c.open) load(); });
  c.open = openCards().has(id);
  if (c.open) load();
  parent.append(c);
}

/** `text` (a field name, xmlid…) as a button copying it to the clipboard; ✓ for a second after. `label`: shown instead (e.g. masked). */
export function copyable(text, cls = 'name', label = text) {
  const b = el('button', {
    class: `${cls} copy`, title: _t('Click to copy'),
    onclick: async () => {
      try { await navigator.clipboard.writeText(text); } catch { // clipboard API refused (focus, permissions policy)
        const ta = el('textarea', { value: text });
        document.body.append(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      b.classList.add('copied');
      setTimeout(() => b.classList.remove('copied'), 1000);
    },
  }, label);
  return b;
}

/** Search box hiding the `items` whose data-q doesn't contain its text; onCount(visible) after each change. */
export function filterBox(items, placeholder, onCount) {
  const input = el('input', { type: 'search', placeholder });
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    for (const li of items) li.hidden = !li.dataset.q.includes(q);
    onCount?.(items.filter((li) => !li.hidden).length);
  });
  return input;
}

/** List item that toggles open on click / Enter / Space (open shows everything below its .row, see panel.css)
 * and builds its detail pane the first time (`detail` may be async, or omitted: the row only unfolds). */
export function expandable(li, detail) {
  li.tabIndex = 0;
  li.addEventListener('keydown', (ev) => {
    if (ev.target === li && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); li.click(); }
  });
  li.addEventListener('click', async (ev) => {
    const own = ev.target.closest('.detail, details, a, button, input, select');
    if (own && li.contains(own)) return; // not an ancestor: a row nested in another row's .detail still toggles
    li.classList.toggle('open');
    if (!detail || li.querySelector('.detail')) return;
    const d = el('div', { class: 'detail' }, el('div', { class: 'loading' }, _t('Loading…')));
    li.append(d);
    try { d.replaceChildren(...[await detail()].filter(Boolean)); } catch (e) { d.replaceChildren(errBox(e)); }
  });
  return li;
}
