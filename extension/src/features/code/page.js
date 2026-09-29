// Function injected into the Odoo tab (MAIN world) via chrome.scripting.executeScript.
// Self-contained: only its source text is sent to the page.

/** Runs `code` (the body of an async function) with a small ORM over /web/dataset/call_kw, in the Odoo session:
 * the server applies the logged-in user's ACLs, record rules, field groups and companies to every call.
 * opts.readonly blocks every method outside READ before it is sent. That is a guard against slips, not a security
 * boundary: the code runs with the page's own JS rights, and the server is what enforces access.
 * Returns { ok, value?, error?, out, calls, ms }, JSON-safe (recordsets → { $recordset, ids }). */
export async function pageRunCode(code, opts = {}) {
  const N_ = (s) => s; // error msgids, translated by the panel
  const { readonly = true, context: fallback = {}, uid: fallbackUid = null } = opts;
  const f = window.__odooDebugHook?.fetch || window.fetch; // unhooked: the RPC tab logs the page's calls, not ours
  const MAX_CALLS = 1000; // a loop gone wrong stops here instead of hammering the server
  const SOURCE = 'odoo-debug-code.js';
  const HEADER_LINES = 2; // lines V8 puts before the body of `new AsyncFunction(...)`
  // Methods that only read. Everything else (write, create, unlink, action_*, button_*…) needs "Allow writes".
  const READ = new Set([
    'search', 'search_read', 'search_count', 'search_fetch', 'read', 'read_group', 'formatted_read_group',
    'web_search_read', 'web_read', 'web_read_group', 'fields_get', 'name_search', 'default_get', 'get_views',
    'get_view', 'has_access', 'check_access', 'check_access_rights', 'check_access_rule', 'exists', 'has_group',
    'check_object_reference', 'get_metadata', 'export_data', 'read_progress_bar',
  ]);
  // @api.model methods: called without ids (call_kw would take the first argument as the ids otherwise).
  const MODEL_LEVEL = new Set([
    'search', 'search_read', 'search_count', 'read_group', 'formatted_read_group', 'web_search_read', 'web_read_group',
    'fields_get', 'name_search', 'name_create', 'default_get', 'get_views', 'get_view', 'create', 'check_object_reference',
    'read_progress_bar',
  ]);

  const started = performance.now();
  const out = [];
  const calls = [];

  let userContext = null;
  try { userContext = window.odoo?.loader?.modules?.get('@web/core/user')?.user?.context; } catch { /* webclient internals moved */ }
  const base = { ...(userContext || fallback) }; // lang, tz, uid, allowed_company_ids: what the webclient itself sends
  const uid = base.uid ?? fallbackUid;
  const companyIds = base.allowed_company_ids || [];

  const fail = (msgid, args, message) => Object.assign(new Error(message), { msgid, args });
  const short = (v) => { try { const s = JSON.stringify(v); return s.length > 300 ? `${s.slice(0, 300)}…` : s; } catch { return String(v); } };

  async function callKw(model, method, args, kwargs, context) {
    const name = `${model}.${method}`;
    if (readonly && !READ.has(method)) {
      throw fail(N_('%s writes: blocked in read-only mode (tick "Allow writes" to run it)'), [name], `${name} writes: blocked in read-only mode`);
    }
    if (calls.length >= MAX_CALLS) throw fail(N_('Stopped after %s calls'), [MAX_CALLS], `Stopped after ${MAX_CALLS} calls`);
    const entry = { model, method, args: short(args), kwargs: short(kwargs), write: !READ.has(method), ms: 0 };
    calls.push(entry);
    const t = performance.now();
    try {
      const r = await f(`/web/dataset/call_kw/${model}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'call', id: Date.now(),
          params: { model, method, args, kwargs: { ...kwargs, context: { ...base, ...context, ...kwargs.context } } },
        }),
      });
      const j = await r.json();
      if (j.error) {
        const d = j.error.data || {};
        entry.error = d.message || j.error.message;
        throw Object.assign(new Error(entry.error), { traceback: d.debug, type: d.name, server: true });
      }
      return j.result;
    } finally {
      entry.ms = Math.round(performance.now() - t);
    }
  }

  const fieldCache = new Map();
  async function fieldInfo(rs, name) {
    const key = `${rs._name} ${name}`;
    if (!fieldCache.has(key)) fieldCache.set(key, (await rs._model('fields_get', [[name]], { attributes: ['type', 'relation'] }))[name]);
    const info = fieldCache.get(key);
    if (!info) throw fail(N_('%s has no field %s'), [rs._name, name], `${rs._name} has no field ${name}`);
    return info;
  }

  class Recordset {
    constructor(model, ids, context) {
      this._name = model;
      this._ids = ids;
      this._context = context;
    }
    get ids() { return [...this._ids]; }
    get id() { return this._ids[0] ?? false; }
    get length() { return this._ids.length; }
    get context() { return { ...base, ...this._context }; }
    toString() { return `${this._name}(${this._ids.join(', ')})`; }
    _model(method, args = [], kwargs = {}) { return callKw(this._name, method, args, kwargs, this._context); }
    _records(method, args = [], kwargs = {}) { return callKw(this._name, method, [this._ids, ...args], kwargs, this._context); }

    browse(ids = []) {
      const list = (Array.isArray(ids) ? ids : [ids]).filter((id) => id || id === 0);
      return wrap(this._name, list, this._context);
    }
    with_context(ctx = {}) { return wrap(this._name, this._ids, { ...this._context, ...ctx }); }
    ensure_one() {
      if (this._ids.length !== 1) throw fail(N_('Expected singleton: %s'), [String(this)], `Expected singleton: ${this}`);
      return this;
    }
    /** Any public method: on these records (their ids go first), or on the model when the recordset is empty or the
     * method is a known @api.model one. env['x'].call('m', args, kwargs) is therefore always a model-level call. */
    call(method, args = [], kwargs = {}) {
      return MODEL_LEVEL.has(method) || !this._ids.length ? this._model(method, args, kwargs) : this._records(method, args, kwargs);
    }

    async search(domain = [], kwargs = {}) { return this.browse(await this._model('search', [domain], kwargs)); }
    search_read(domain = [], fields, kwargs = {}) { return this._model('search_read', [domain], { ...(fields && { fields }), ...kwargs }); }
    search_count(domain = [], kwargs = {}) { return this._model('search_count', [domain], kwargs); }
    read(fields, kwargs = {}) { return this._records('read', [], { ...(fields && { fields }), ...kwargs }); }
    read_group(domain, fields, groupby, kwargs = {}) { return this._model('read_group', [domain, fields, groupby], kwargs); }
    fields_get(allfields, attributes) {
      return this._model('fields_get', [], { ...(allfields && { allfields }), ...(attributes && { attributes }) });
    }
    name_search(name = '', kwargs = {}) { return this._model('name_search', [], { name, ...kwargs }); }
    async create(vals) {
      const r = await this._model('create', [vals]);
      return this.browse(r);
    }
    write(vals) { return this._records('write', [vals]); }
    unlink() { return this._records('unlink'); }
    async copy(defaults) {
      const r = await this._records('copy', [], defaults ? { default: defaults } : {});
      return this.browse(r);
    }
    async exists() { return this.browse(await this._records('exists')); }
    async filtered_domain(domain) {
      if (!this._ids.length) return this;
      const found = new Set(await this._model('search', [[['id', 'in', this._ids], ...domain]], { context: { active_test: false } }));
      return this.browse(this._ids.filter((id) => found.has(id)));
    }
    /** mapped('partner_id.country_id.code'): reads hop by hop. Relational end → recordset (deduplicated), else values. */
    async mapped(path) {
      let rs = this;
      const parts = path.split('.');
      for (const [i, name] of parts.entries()) {
        const last = i === parts.length - 1;
        const info = await fieldInfo(rs, name);
        const relational = ['many2one', 'one2many', 'many2many'].includes(info.type);
        if (!relational && !last) throw fail(N_('%s.%s is not relational'), [rs._name, name], `${rs._name}.${name} is not relational`);
        const rows = rs._ids.length ? await rs._records('read', [], { fields: [name], load: false }) : [];
        if (!relational) return rows.map((r) => r[name]);
        const ids = new Set();
        for (const r of rows) for (const id of info.type === 'many2one' ? [r[name]] : r[name]) if (id) ids.add(id);
        rs = wrap(info.relation, [...ids], rs._context);
      }
      return rs;
    }
  }

  /** Unknown attributes become record methods: `await so.action_confirm()` → call_kw(sale.order, action_confirm, [ids]). */
  function wrap(model, ids, context = {}) {
    return new Proxy(new Recordset(model, ids, context), {
      get(target, prop, receiver) {
        if (typeof prop === 'symbol' || prop in target) return Reflect.get(target, prop, receiver);
        if (prop === 'then' || prop === 'toJSON' || prop.startsWith('_')) return undefined; // `await rs` must not call the server
        return (...args) => target.call(prop, args);
      },
    });
  }

  const api = {
    uid,
    context: base,
    lang: base.lang,
    get user() { return wrap('res.users', uid ? [uid] : []); },
    get company() { return wrap('res.company', companyIds.slice(0, 1)); },
    get companies() { return wrap('res.company', companyIds); },
    /** env.ref('base.main_company'): only records the user can read (check_object_reference raises otherwise). */
    async ref(xmlid) {
      const [module, ...rest] = xmlid.split('.');
      const [model, id] = await callKw('ir.model.data', 'check_object_reference', [module, rest.join('.'), true], {}, {});
      return wrap(model, [id]);
    },
  };
  const env = new Proxy(api, {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      return prop in target ? target[prop] : wrap(prop, []);
    },
  });
  const Command = {
    create: (vals) => [0, 0, vals], update: (id, vals) => [1, id, vals], delete: (id) => [2, id, 0],
    unlink: (id) => [3, id, 0], link: (id) => [4, id, 0], clear: () => [5, 0, 0], set: (ids) => [6, 0, ids],
  };

  function plain(v, seen = new WeakSet(), depth = 0) {
    if (v instanceof Recordset) return { $recordset: v._name, ids: v.ids };
    if (v === undefined) return null;
    if (typeof v === 'bigint' || typeof v === 'function' || typeof v === 'symbol') return String(v);
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Date) return v.toISOString();
    if (v instanceof Error) return String(v);
    if (seen.has(v)) return '[Circular]';
    if (depth > 30) return '…';
    seen.add(v);
    const r = Array.isArray(v) ? v.map((x) => plain(x, seen, depth + 1))
      : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x, seen, depth + 1)]));
    seen.delete(v);
    return r;
  }
  const print = (...args) => { out.push(args.map((a) => plain(a))); };
  const done = (extra) => ({ out, calls, ms: Math.round(performance.now() - started), readonly, uid, ...extra });

  try {
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const fn = new AsyncFunction('env', 'print', 'Command', `${code}\n//# sourceURL=${SOURCE}`);
    const value = await fn(env, print, Command);
    return done({ ok: true, value: value === undefined ? undefined : plain(value), hasValue: value !== undefined });
  } catch (e) {
    const at = String(e?.stack || '').match(new RegExp(`${SOURCE.replace('.', '\\.')}:(\\d+):(\\d+)`));
    return done({
      ok: false,
      error: {
        message: String(e?.message ?? e), name: e?.name || '', type: e?.type || '', traceback: e?.traceback || '',
        msgid: e?.msgid || '', args: e?.args || [], server: !!e?.server,
        line: at ? +at[1] - HEADER_LINES : null,
      },
    });
  }
}
