// Pure helpers, no chrome.* / DOM: tested by tests/code.test.mjs.

export const MAX_ROWS = 500; // table rows shown; the raw JSON below it still has everything

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

/** Calls summary: how many, how many wrote, how many failed. */
export function callStats(calls = []) {
  return { total: calls.length, writes: calls.filter((c) => c.write).length, errors: calls.filter((c) => c.error).length };
}
