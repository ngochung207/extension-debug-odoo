// Pure helpers, no chrome.* / DOM: tested by tests/code.test.mjs.

export const MAX_ROWS = 500; // table rows shown; the raw JSON below it still has everything

/** localStorage key of the editor's code for an Odoo origin (scheme + host + port: two ports are two servers). */
export const codeKey = (origin) => `odoo-debug-orm-code:${origin || ''}`;

export const isRecordset = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.$recordset === 'string';
export const recordsetText = (v) => `${v.$recordset}(${v.ids.join(', ')})`;

/** A value from pageRunCode as text: recordsets as sale.order(1, 2), the rest as indented JSON. */
export function formatValue(v) {
  if (isRecordset(v)) return recordsetText(v);
  if (typeof v === 'string') return JSON.stringify(v);
  return JSON.stringify(v, (k, x) => (isRecordset(x) ? recordsetText(x) : x), 2) ?? String(v);
}

/** One print(...) line: strings as-is (like Python's print), everything else formatted. */
export const printText = (values) => values.map((v) => (typeof v === 'string' ? v : formatValue(v))).join(' ');

/** A table cell: many2one [id, name] → "name #id", id lists → "1, 2", recordsets → model(ids), objects → JSON. */
export function cellText(v) {
  if (v == null) return '';
  if (isRecordset(v)) return recordsetText(v);
  if (Array.isArray(v)) {
    if (v.length === 2 && Number.isInteger(v[0]) && typeof v[1] === 'string') return `${v[1]} #${v[0]}`;
    if (v.every((x) => typeof x === 'number')) return v.join(', ');
    return JSON.stringify(v);
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** A list of plain objects (search_read, read, read_group…) → { columns, rows, total }, or null when it is not one.
 * Columns in first-seen order, id first. */
export function toTable(v, max = MAX_ROWS) {
  if (!Array.isArray(v) || !v.length) return null;
  if (!v.every((r) => r && typeof r === 'object' && !Array.isArray(r) && !isRecordset(r))) return null;
  const cols = [];
  const seen = new Set();
  for (const r of v) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
  if (seen.has('id')) cols.splice(cols.indexOf('id'), 1), cols.unshift('id');
  return { columns: cols, rows: v.slice(0, max).map((r) => cols.map((c) => cellText(r[c]))), total: v.length };
}

/** Calls summary: how many, how many wrote, how many failed, how many wrote and succeeded (the page then shows stale data). */
export function callStats(calls = []) {
  return {
    total: calls.length, writes: calls.filter((c) => c.write).length, errors: calls.filter((c) => c.error).length,
    written: calls.filter((c) => c.write && !c.error).length,
  };
}

// ---------- suggestions in the editor ----------

/** The recordset API of page.js (pageRunCode), suggested after a dot: [name, signature]. */
export const METHODS = [
  ['search', '(domain, { limit, order })'], ['search_read', '(domain, fields)'], ['search_count', '(domain)'],
  ['read', '(fields)'], ['read_group', '(domain, fields, groupby)'], ['fields_get', '()'], ['name_search', '(name)'],
  ['browse', '(ids)'], ['with_context', '(ctx)'], ['ensure_one', '()'], ['exists', '()'], ['mapped', "('a.b')"],
  ['filtered_domain', '(domain)'], ['create', '(vals)'], ['write', '(vals)'], ['unlink', '()'], ['copy', '(defaults)'],
  ['call', '(method, args, kwargs)'], ['ids', ''], ['id', ''], ['length', ''],
];
export const ENV_MEMBERS = [['user', ''], ['company', ''], ['companies', ''], ['uid', ''], ['context', ''], ['lang', ''], ['ref', "('module.xmlid')"]];
export const COMMAND_MEMBERS = [['create', '(vals)'], ['update', '(id, vals)'], ['delete', '(id)'], ['unlink', '(id)'], ['link', '(id)'], ['clear', '()'], ['set', '(ids)']];
export const GLOBALS = [['env', "['model']"], ['print', '(…)'], ['Command', '.create / link / set…'], ['await', ''], ['return', '']];

/**
 * What to suggest at `pos` in `code`, or null:
 * - { kind: 'model', prefix }: inside env['…'
 * - { kind: 'field', model, path, prefix }: inside a string ('state', 'partner_id.na'), fields of the last env['model']
 *   before the cursor, following `path` (the relational fields before the last dot)
 * - { kind: 'member', model, path, prefix, on }: after a dot (orders.partner_id.na): methods and fields; `on` is the
 *   first word (env., Command. have their own members)
 * - { kind: 'global', prefix }: a bare word (env, print…)
 * `from` is where the replaced prefix starts. No type inference: every variable is taken as a recordset of the last
 * env['model'] written before the cursor (ponytail: enough for one-model snippets; a real JS parser if it is not).
 */
export function completionAt(code, pos) {
  const before = code.slice(0, pos);
  const line = before.slice(before.lastIndexOf('\n') + 1);
  const at = (prefix) => pos - prefix.length;
  const envs = [...before.matchAll(/env\[\s*(['"])([\w.]+)\1\s*\]/g)];
  const model = envs.at(-1)?.[2] || null;

  let m = /env\[\s*(['"])([\w.]*)$/.exec(before);
  if (m) return { kind: 'model', prefix: m[2], from: at(m[2]) };

  m = /(['"])([\w.]*)$/.exec(line);
  if (m) {
    const quotes = line.slice(0, m.index).split(m[1]).length - 1;
    if (quotes % 2) return null; // the closing quote of a string: nothing to suggest after it
    if (!model) return null;
    const parts = m[2].split('.');
    const prefix = parts.pop();
    return { kind: 'field', model, path: parts, prefix, from: at(prefix) };
  }

  // a.b.c.pre or env['x'].pre / (…).pre: the chain after the first word are fields
  m = /(?:([A-Za-z_$][\w$]*)|[\])])((?:\.[A-Za-z_]\w*)*)\.([A-Za-z_]\w*)?$/.exec(line);
  if (m) {
    const prefix = m[3] || '';
    const path = m[2].split('.').filter(Boolean);
    return { kind: 'member', model, path, prefix, from: at(prefix), on: m[1] || null };
  }

  m = /(?:^|[^\w$.'"])([A-Za-z_]\w*)$/.exec(line);
  if (m) return { kind: 'global', prefix: m[1], from: at(m[1]) };
  return null;
}

/** items: [{ label, detail }] → the ones matching `prefix`: starting with it first, then containing it; at most `max`
 * (every field of a big model: right after a dot the list must reach them all by scrolling). */
export function rankSuggestions(items, prefix, max = 500) {
  const p = prefix.toLowerCase();
  const starts = [], contains = [];
  for (const it of items) {
    const l = it.label.toLowerCase();
    if (l === p) continue; // already typed in full
    if (l.startsWith(p)) starts.push(it);
    else if (p && l.includes(p)) contains.push(it);
  }
  return [...starts, ...contains].slice(0, max);
}
