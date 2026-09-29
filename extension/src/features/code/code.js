// Code tab: JS with an ORM-like `env` (env['sale.order'].search(...), .read(), .write()…), run in the Odoo page through
// /web/dataset/call_kw with the logged-in session, so the server applies that user's rights to every call.
// Read-only unless "Allow writes" is ticked (never remembered): every call is its own transaction, committed at once.
import { pageRunCode } from './page.js';
import { formatValue, printText, toTable, callStats, MAX_ROWS, completionAt, rankSuggestions, METHODS, ENV_MEMBERS, COMMAND_MEMBERS, GLOBALS } from './logic.js';
import { exec, sessionInfo, el, pill, pre, details, block, cached, call, fieldsOf } from '../../shared/ui.js';
import { _t } from '../../shared/i18n.js';

// The code is kept in the panel's localStorage (every instance), and ⟳ Reload Data does not clear it: a snippet is
// work, not a filter. The "Allow writes" box is never kept.
const CODE_KEY = 'odoo-debug-orm-code';
const loadCode = () => { try { return localStorage.getItem(CODE_KEY); } catch { return null; } };
const saveCode = (code) => { try { localStorage.setItem(CODE_KEY, code); } catch { /* storage off */ } };

export function renderCode(s) {
  block(s, 'console', _t('ORM Console'), async () => {
    const info = await sessionInfo();
    const editor = el('textarea', {
      class: 'code', rows: 10, spellcheck: false, value: loadCode() ?? '',
      'aria-label': _t('Code'),
    });
    editor.setAttribute('autocapitalize', 'off');
    editor.setAttribute('autocomplete', 'off');
    const writes = el('input', { type: 'checkbox' });
    const run = el('button', { class: 'btn', type: 'button', title: _t('Run (⌘/Ctrl+Enter)') }, _t('Run'));
    const output = el('div', { class: 'output' });

    const go = async () => {
      if (run.disabled) return;
      run.disabled = true;
      saveCode(editor.value);
      output.replaceChildren(el('div', { class: 'loading' }, _t('Running…')));
      const r = await exec(pageRunCode, editor.value, { readonly: !writes.checked, context: info.user_context || {}, uid: info.uid });
      run.disabled = false;
      output.replaceChildren(...result(r));
    };
    run.addEventListener('click', go);
    const hints = suggester(editor);
    editor.addEventListener('input', () => { saveCode(editor.value); hints.update(); });
    let escaped = false; // Esc, then Tab: leaves the editor (keyboard users are not trapped by the indenting Tab)
    editor.addEventListener('keydown', (ev) => {
      if (hints.key(ev)) { escaped = false; return; } // the suggestion list took the key
      const wasEscaped = escaped;
      escaped = ev.key === 'Escape';
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); go(); }
      else if (ev.key === 'Tab' && !wasEscaped && !ev.shiftKey && !ev.altKey && !ev.metaKey && !ev.ctrlKey) {
        ev.preventDefault(); // indent instead of leaving the editor (Shift+Tab or Esc then Tab still leave it)
        editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
        saveCode(editor.value);
      }
    });

    const root = el('div', { class: 'console' },
      el('div', { class: 'note mt0' }, _t('Runs as %s (uid %s): their access rights, record rules and companies apply.', info.username || info.name || '?', info.uid)),
      editor,
      hints.box,
      el('div', { class: 'row mt' },
        run,
        el('label', { class: 'check', title: _t('Lets the code call write, create, unlink and any other method that is not a read') },
          writes, _t('Allow writes')),
        el('span', { class: 'grow' }),
        el('span', { class: 'muted' }, _t('⌘/Ctrl+Enter'))),
      el('div', { class: 'note' }, _t('Read-only by default. With writes allowed, each call is committed at once: there is no rollback.')),
      output,
      help());
    const flag = () => root.classList.toggle('writes-on', writes.checked);
    writes.addEventListener('change', flag);
    return root;
  });
}

// ---------- suggestions while typing: models of the installed modules, their fields, the recordset API ----------

const pairs = (list) => list.map(([label, detail]) => ({ label, detail }));
// ir.model only lists the models of installed modules; `modules` (In Apps) names the ones defining each.
const models = () => cached('models', async () => {
  const withModules = 'modules' in await fieldsOf('ir.model');
  const rows = await call('ir.model', 'search_read', [[]], { fields: ['model', 'name', ...(withModules ? ['modules'] : [])], order: 'model' });
  return rows.map((r) => ({ label: r.model, detail: [r.name, r.modules].filter(Boolean).join(' · ') }));
});

/** Fields of `model`, after following the relational fields of `path` (partner_id.country_id…). */
async function fieldItems(model, path) {
  for (const f of path) model = model && (await fieldsOf(model))[f]?.relation;
  if (!model) return [];
  return Object.entries(await fieldsOf(model)).map(([name, f]) =>
    ({ label: name, detail: `${f.type}${f.relation ? ` → ${f.relation}` : ''} · ${f.string}` }));
}

async function itemsFor(c) {
  if (c.kind === 'model') return models();
  if (c.kind === 'field') return fieldItems(c.model, c.path);
  if (c.kind === 'global') return pairs(GLOBALS);
  if (c.on === 'env' && !c.path.length) return pairs(ENV_MEMBERS);
  if (c.on === 'Command' && !c.path.length) return pairs(COMMAND_MEMBERS);
  return [...pairs(METHODS), ...await fieldItems(c.model, c.path)];
}

/** The list under `editor`: update() after each edit, key(ev) first in its keydown (true: the key was used). */
function suggester(editor) {
  const box = el('ul', { class: 'suggest', role: 'listbox', 'aria-label': _t('Suggestions') });
  box.hidden = true;
  let shown = [], active = 0, ctx = null, seq = 0;

  const close = () => { seq++; box.hidden = true; shown = []; };
  const mark = () => {
    [...box.children].forEach((li, i) => li.setAttribute('aria-selected', i === active));
    const li = box.children[active]; // kept in view by hand: scrollIntoView could scroll the Odoo page around the panel
    if (li.offsetTop < box.scrollTop) box.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = li.offsetTop + li.offsetHeight - box.clientHeight;
  };
  const accept = () => {
    editor.setRangeText(shown[active].label, ctx.from, editor.selectionStart, 'end');
    close();
    editor.dispatchEvent(new Event('input')); // saved, and the next suggestions (after a model: none)
  };

  /** manual: Ctrl+Space, also for bare words (typed, `co` would offer Command while writing const). */
  async function update(manual = false) {
    const n = ++seq;
    const c = editor.selectionStart === editor.selectionEnd ? completionAt(editor.value, editor.selectionStart) : null;
    if (!c || (c.kind === 'global' && !manual)) return close();
    const items = rankSuggestions(await itemsFor(c).catch(() => []), c.prefix);
    if (n !== seq) return; // typed again meanwhile
    if (!items.length) return close();
    ctx = c;
    shown = items;
    active = 0;
    box.replaceChildren(...items.map((it, i) => el('li', {
      role: 'option',
      onmousedown: (e) => { e.preventDefault(); active = i; accept(); }, // mousedown: before the editor loses focus
    }, el('span', { class: 'name' }, it.label), it.detail && el('span', { class: 'muted' }, it.detail))));
    box.hidden = false;
    mark();
  }

  function key(ev) {
    if (ev.key === ' ' && ev.ctrlKey) { ev.preventDefault(); update(true); return true; }
    if (box.hidden) return false;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      mark();
      return true;
    }
    if ((ev.key === 'Enter' && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey) || (ev.key === 'Tab' && !ev.shiftKey)) {
      ev.preventDefault();
      accept();
      return true;
    }
    if (ev.key === 'Escape') { ev.preventDefault(); close(); return true; }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(ev.key)) close(); // the cursor moves away
    return false;
  }

  editor.addEventListener('blur', close);
  editor.addEventListener('click', close);
  return { box, update, key };
}

// The guide below the editor, in the manner of Odoo's server action ("Available variables: - env: …").
const EXAMPLE = [
  "orders = await env['sale.order'].search([['state', '=', 'sale']], { limit: 5 })",
  'for (const order of orders) print(order.name, order.partner_id.name)',
  "return orders.read(['name', 'partner_id', 'amount_total'])",
].join('\n');

function help() {
  const list = (items) => el('ul', { class: 'help-list' }, items.map(([name, desc]) => el('li', {}, el('code', {}, name), ': ', desc)));
  return el('div', { class: 'code-help' },
    el('div', { class: 'help-title' }, _t('Available variables:')),
    list([
      ['env', _t("environment of the logged-in user, with their access rights and record rules; env['res.partner'] is a void recordset")],
      ['env.user, env.company, env.companies', _t('current user, current company, active companies')],
      ['env.uid, env.context, env.lang', _t('user id, context sent with every call, language')],
      ["env.ref('module.xmlid')", _t('record of an external id, if you can read it')],
      ['print(…)', _t('shows values above the result')],
      ['Command', _t('x2many commands namespace: Command.create(vals), link(id), set(ids)…')],
    ]),
    el('div', { class: 'help-title' }, _t('Recordsets:')),
    list([
      ['search, search_read, search_count, read, read_group, fields_get, name_search', _t('read from the server')],
      ["browse, with_context, ensure_one, exists, mapped('a.b'), filtered_domain", _t('work like in Python')],
      ['rec.state, rec.partner_id.name', _t('field value of a single record, as in Python; await it inside an expression: if (await rec.state === \'sale\')')],
      ['for (const rec of rs)', _t('records one by one; each field is read once for all of them')],
      ['ids, id, length', _t('record ids, first id, count')],
      ['create, write, unlink, copy', _t('write to the server: need "Allow writes"')],
      ['rs.action_confirm()', _t('any other public method, called on these records (also needs "Allow writes")')],
      ["env['model'].call(method, args, kwargs)", _t('a method called on the model, without records')],
    ]),
    el('div', { class: 'help-title' }, _t('Suggestions:')),
    list([
      ["env['", _t('models of the installed modules')],
      ["'…' in a domain or a field list, rec.", _t('fields of the last env[…] model, following relations (partner_id.country_id.)')],
      ['.', _t('recordset methods, env and Command members')],
      ['↑ ↓, Enter / Tab, Esc, Ctrl+Space', _t('pick, insert, close, ask for suggestions')],
    ]),
    el('div', { class: 'help-title' }, _t('To show a result, return it: lists of records show as a table.')),
    pre(EXAMPLE),
    el('div', { class: 'note' }, _t('JavaScript, not Python: await every server call, lists and objects in JS syntax (true / false / null).')),
    el('div', { class: 'note' }, _t('Every call goes through /web/dataset/call_kw as the logged-in user: no sudo(), no SQL, no private _methods. Methods that switch to sudo() inside still do so, as when clicked in Odoo.')),
    el('div', { class: 'note' }, _t('The code runs in the Odoo page with its own JavaScript rights: only run code you understand. An endless loop freezes the page (reload it).')));
}

/** The run's outcome: prints, error or return value, then the calls made. */
function result(r) {
  if (!r || (r.error && !('ok' in r))) return [el('div', { class: 'error' }, r?.error || _t('No response — is this an Odoo page?'))];
  const stats = callStats(r.calls);
  const parts = [el('div', { class: 'row mt' },
    r.ok ? pill(_t('ok'), 'ok') : pill(_t('error'), 'err'),
    pill(r.readonly ? _t('read-only') : _t('writes allowed'), r.readonly ? '' : 'med'),
    el('span', { class: 'ms' }, _t('%s ms', r.ms)),
    el('span', { class: 'ms' }, _t('%s calls', stats.total)),
    stats.writes ? pill(_t('%s write calls', stats.writes), 'med') : null)];
  if (r.out.length) parts.push(el('pre', { class: 'prints' }, r.out.map(printText).join('\n')));
  if (!r.ok) parts.push(errorBox(r.error));
  else if (r.hasValue) parts.push(value(r.value));
  else parts.push(el('div', { class: 'note' }, _t('No return value: end with return … to see one.')));
  if (r.calls.length) parts.push(callList(r.calls));
  return parts;
}

function errorBox(e) {
  const where = e.line ? ` ${_t('(line %s)', e.line)}` : '';
  const message = e.msgid ? _t(e.msgid, ...e.args) : e.message;
  return el('div', { class: 'error mt' },
    e.type ? el('div', { class: 'muted' }, e.type) : e.name && !e.server ? el('div', { class: 'muted' }, e.name) : null,
    message + where,
    e.name === 'EvalError' ? el('div', { class: 'note' }, _t('This page\'s Content-Security-Policy forbids running code (a proxy in front of Odoo adds script-src).')) : null,
    e.traceback ? details(_t('Traceback'), pre(e.traceback)) : null);
}

function value(v) {
  const t = toTable(v);
  if (!t) return el('pre', { class: 'mt' }, formatValue(v));
  return el('div', { class: 'mt' },
    el('div', { class: 'muted' }, t.total > t.rows.length ? _t('%s rows (first %s shown)', t.total, MAX_ROWS) : _t('%s rows', t.total)),
    el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, t.columns.map((c) => el('th', {}, c)))),
      el('tbody', {}, t.rows.map((row) => el('tr', {}, row.map((c) => el('td', {}, c))))))),
    details(_t('JSON'), pre(formatValue(v))));
}

function callList(calls) {
  return details(_t('Calls (%s)', calls.length), el('ul', { class: 'steps' }, calls.map((c) => el('li', {},
    el('div', { class: 'row' },
      el('span', { class: 'name grow' }, `${c.model}.${c.method}`),
      c.write ? pill(_t('write'), 'med') : null,
      c.error ? pill(_t('error'), 'err') : null,
      el('span', { class: 'ms' }, _t('%s ms', c.ms))),
    el('div', { class: 'meta mono' }, `args ${c.args} · kwargs ${c.kwargs}`),
    c.error ? el('div', { class: 'meta error' }, c.error) : null))));
}
