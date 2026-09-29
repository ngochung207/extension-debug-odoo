import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatValue, printText, cellText, toTable, callStats, isRecordset } from '../extension/src/features/code/logic.js';
import { pageRunCode } from '../extension/src/features/code/page.js';

// ---------- logic ----------
const rs = { $recordset: 'res.partner', ids: [1, 2] };
assert.equal(isRecordset(rs), true);
assert.equal(isRecordset([1]), false);
assert.equal(formatValue(rs), 'res.partner(1, 2)');
assert.equal(formatValue('a'), '"a"');
assert.equal(formatValue({ p: rs }), '{\n  "p": "res.partner(1, 2)"\n}');
assert.equal(printText(['count', 3, rs]), 'count 3 res.partner(1, 2)');

assert.equal(cellText([3, 'Azure']), 'Azure #3');
assert.equal(cellText([1, 2, 3]), '1, 2, 3');
assert.equal(cellText(false), 'false');
assert.equal(cellText(null), '');
assert.equal(cellText(rs), 'res.partner(1, 2)');
assert.equal(cellText({ a: 1 }), '{"a":1}');

assert.equal(toTable([]), null);
assert.equal(toTable([1, 2]), null);
assert.equal(toTable([rs]), null);
assert.equal(toTable({ id: 1 }), null);
const t = toTable([{ name: 'A', id: 1 }, { id: 2, name: 'B', extra: [4, 'X'] }], 1);
assert.deepEqual(t.columns, ['id', 'name', 'extra']);
assert.deepEqual(t.rows, [['1', 'A', '']]);
assert.equal(t.total, 2);

assert.deepEqual(callStats([{ write: true }, { error: 'x' }, {}]), { total: 3, writes: 1, errors: 1 });

// ---------- pageRunCode against a fake call_kw ----------
const DB = {
  'res.partner': {
    fields: { name: { type: 'char' }, country_id: { type: 'many2one', relation: 'res.country' }, category_id: { type: 'many2many', relation: 'res.partner.category' } },
    rows: { 1: { name: 'A', country_id: 10, category_id: [5, 6] }, 2: { name: 'B', country_id: 10, category_id: [6] }, 3: { name: 'C', country_id: false, category_id: [] } },
  },
  'res.country': { fields: { code: { type: 'char' } }, rows: { 10: { code: 'VN' } } },
};

function server(log) {
  return async (url, init) => {
    const { params } = JSON.parse(init.body);
    const { model, method, args, kwargs } = params;
    log.push({ url, model, method, args, kwargs });
    const m = DB[model];
    const reply = (result) => ({ json: async () => ({ jsonrpc: '2.0', result }) });
    const err = (message, name) => ({ json: async () => ({ jsonrpc: '2.0', error: { message: 'Odoo Server Error', data: { message, name, debug: 'Traceback…' } } }) });
    if (method === 'search') return reply(Object.keys(m.rows).map(Number).filter((id) => !args[0].length || args[0].some(([f, , v]) => f === 'id' && v.includes(id))));
    if (method === 'fields_get') return reply(Object.fromEntries(args[0].map((f) => [f, m.fields[f]])));
    if (method === 'read') {
      const load = kwargs.load !== false;
      return reply(args[0].map((id) => Object.fromEntries([['id', id], ...kwargs.fields.map((f) => {
        const v = m.rows[id][f];
        return [f, load && m.fields[f].type === 'many2one' && v ? [v, `#${v}`] : v];
      })])));
    }
    if (method === 'write') return err('You are not allowed to modify this document', 'odoo.exceptions.AccessError');
    if (method === 'check_object_reference') return reply(['res.partner', 1]);
    if (method === 'action_confirm') return reply(true);
    return err(`no ${method}`, 'builtins.AttributeError');
  };
}

async function run(code, opts = {}) {
  const log = [];
  globalThis.window = { fetch: server(log), odoo: opts.odoo };
  const r = await pageRunCode(code, { context: { lang: 'en_US', uid: 2, allowed_company_ids: [1] }, ...opts });
  return { r, log };
}

test('search, read and the user context', async () => {
  const { r, log } = await run(`const rs = await env['res.partner'].search([]);\nprint('n', rs.length, rs);\nreturn rs.read(['name']);`);
  assert.equal(r.ok, true, r.error?.message);
  assert.deepEqual(r.out, [['n', 3, { $recordset: 'res.partner', ids: [1, 2, 3] }]]);
  assert.deepEqual(r.value.map((x) => x.name), ['A', 'B', 'C']);
  assert.equal(log[0].url, '/web/dataset/call_kw/res.partner/search');
  assert.deepEqual(log[0].args, [[]]); // model-level: no ids
  assert.deepEqual(log[1].args, [[1, 2, 3]]); // record-level: ids first
  assert.deepEqual(log[1].kwargs.context, { lang: 'en_US', uid: 2, allowed_company_ids: [1] });
  assert.equal(r.calls.length, 2);
  assert.equal(r.readonly, true);
});

test('the webclient user context wins over the panel fallback; with_context merges', async () => {
  const odoo = { loader: { modules: new Map([['@web/core/user', { user: { context: { lang: 'vi_VN', uid: 9, allowed_company_ids: [3, 4] } } }]]) } };
  const { r, log } = await run(`const rs = env['res.partner'].browse([1]).with_context({ active_test: false });\nawait rs.read(['name']);\nreturn [env.uid, env.company, env.companies, env.user];`, { odoo });
  assert.equal(r.ok, true, r.error?.message);
  assert.deepEqual(log[0].kwargs.context, { lang: 'vi_VN', uid: 9, allowed_company_ids: [3, 4], active_test: false });
  assert.deepEqual(r.value, [9, { $recordset: 'res.company', ids: [3] }, { $recordset: 'res.company', ids: [3, 4] }, { $recordset: 'res.users', ids: [9] }]);
});

test('mapped follows many2one / many2many hops and dedupes', async () => {
  const { r } = await run(`const rs = env['res.partner'].browse([1, 2, 3]);\nreturn [await rs.mapped('country_id.code'), await rs.mapped('category_id'), await rs.mapped('name')];`);
  assert.equal(r.ok, true, r.error?.message);
  assert.deepEqual(r.value, [['VN'], { $recordset: 'res.partner.category', ids: [5, 6] }, ['A', 'B', 'C']]);
  const bad = await run(`return env['res.partner'].browse([1]).mapped('name.x');`);
  assert.equal(bad.r.ok, false);
  assert.equal(bad.r.error.msgid, '%s.%s is not relational');
});

test('read-only blocks writes before they are sent', async () => {
  const { r, log } = await run(`await env['res.partner'].browse([1]).write({ name: 'X' });`);
  assert.equal(r.ok, false);
  assert.match(r.error.msgid, /blocked in read-only mode/);
  assert.deepEqual(r.error.args, ['res.partner.write']);
  assert.equal(log.length, 0);
  const proxied = await run(`await env['sale.order'].browse([1]).action_confirm();`);
  assert.equal(proxied.r.ok, false);
  assert.equal(proxied.log.length, 0);
});

test('writes allowed: server errors come back with type and traceback; unknown methods go through with ids first', async () => {
  const { r, log } = await run(`return env['res.partner'].browse([1]).write({ name: 'X' });`, { readonly: false });
  assert.equal(r.ok, false);
  assert.equal(r.error.type, 'odoo.exceptions.AccessError');
  assert.equal(r.error.traceback, 'Traceback…');
  assert.equal(r.error.server, true);
  assert.equal(r.calls[0].write, true);
  assert.equal(r.calls[0].error, 'You are not allowed to modify this document');
  assert.equal(log.length, 1);
  const ok = await run(`return env['res.partner'].browse([4]).action_confirm();`, { readonly: false });
  assert.equal(ok.r.value, true);
  assert.deepEqual(ok.log[0].args, [[4]]);
});

test('awaiting a recordset or env does not call the server; env.ref', async () => {
  const { r, log } = await run(`const rs = await env['res.partner'].browse(1);\nreturn [rs, (await env.ref('base.partner_admin')).id];`);
  assert.equal(r.ok, true, r.error?.message);
  assert.deepEqual(r.value, [{ $recordset: 'res.partner', ids: [1] }, 1]);
  assert.deepEqual(log.map((c) => c.method), ['check_object_reference']);
  assert.deepEqual(log[0].args, ['base', 'partner_admin', true]);
});

test('errors in the code report their line; no return value; Command', async () => {
  const { r } = await run(`const a = 1;\nnull.x;`);
  assert.equal(r.ok, false);
  assert.equal(r.error.line, 2);
  assert.equal(r.error.name, 'TypeError');
  const syntax = await run(`return (;`);
  assert.equal(syntax.r.ok, false);
  assert.equal(syntax.r.error.name, 'SyntaxError');
  const none = await run(`print(Command.set([1, 2]), Command.link(3));`);
  assert.equal(none.r.ok, true);
  assert.equal(none.r.hasValue, false);
  assert.deepEqual(none.r.out, [[[6, 0, [1, 2]], [4, 3, 0]]]);
});

test('ensure_one, filtered_domain, circular values', async () => {
  const one = await run(`env['res.partner'].browse([1, 2]).ensure_one();`);
  assert.equal(one.r.error.msgid, 'Expected singleton: %s');
  assert.deepEqual(one.r.error.args, ['res.partner(1, 2)']);
  const fd = await run(`return env['res.partner'].browse([3, 1, 9]).filtered_domain([['name', '!=', false]]);`);
  assert.deepEqual(fd.r.value, { $recordset: 'res.partner', ids: [3, 1] });
  assert.deepEqual(fd.log[0].kwargs.context.active_test, false);
  const circ = await run(`const o = { a: 1 }; o.self = o; return o;`);
  assert.deepEqual(circ.r.value, { a: 1, self: '[Circular]' });
});
