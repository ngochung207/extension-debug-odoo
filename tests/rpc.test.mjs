import assert from 'node:assert/strict';
import { parseRpc, parseRpcResponse, prettyJson, toCurl } from '../extension/src/features/rpc/logic.js';

const raw = (url, body, method = 'POST', status = 200, response = '{"jsonrpc":"2.0","result":true}') =>
  ({ method, url, body: typeof body === 'string' ? body : JSON.stringify(body), status, ms: 12, at: 't', response });

// call_kw
let e = parseRpc(raw('https://x.com/web/dataset/call_kw/res.partner/web_read',
  { jsonrpc: '2.0', params: { model: 'res.partner', method: 'web_read', args: [[1]], kwargs: { specification: {} } } }));
assert.equal(e.model, 'res.partner'); assert.equal(e.method, 'web_read'); assert.deepEqual(e.args, [[1]]); assert.equal(e.ms, 12);
assert.equal(e.result, true);
// other JSON route, with error response
e = parseRpc(raw('https://x.com/web/action/load', { jsonrpc: '2.0', params: { action_id: 5 } }, 'POST', 200,
  '{"jsonrpc":"2.0","error":{"data":{"name":"odoo.exceptions.AccessError","message":"no"}}}'));
assert.equal(e.method, '/web/action/load'); assert.deepEqual(e.args, { action_id: 5 }); assert.equal(e.errorType, 'odoo.exceptions.AccessError');
// JSON-2
e = parseRpc(raw('https://x.com/json/2/sale.order/action_confirm', { ids: [3] }));
assert.equal(e.model, 'sale.order'); assert.equal(e.method, 'action_confirm');
// body cut by hook.js (> 200 KB): still logged, model/method from the URL
const cut = JSON.stringify({ jsonrpc: '2.0', params: { model: 'ir.attachment', method: 'create', args: [{ datas: 'A'.repeat(300) }] } }).slice(0, 100);
e = parseRpc(raw('https://x.com/web/dataset/call_kw/ir.attachment/create', cut));
assert.equal(e.model, 'ir.attachment'); assert.equal(e.method, 'create'); assert.match(e.args, /^\{"jsonrpc".*…$/);
e = parseRpc(raw('https://x.com/web/dataset/call_button/sale.order/action_confirm', cut));
assert.equal(e.method, 'action_confirm');
// ignored
assert.equal(parseRpc(raw('https://x.com/web/image', 'x')), null);
assert.equal(parseRpc(raw('https://x.com/web/dataset/call_kw', {}, 'GET')), null);

// responses
assert.deepEqual(parseRpcResponse('{"jsonrpc":"2.0","result":[1]}', 200), { result: [1] });
assert.deepEqual(parseRpcResponse('{"jsonrpc":"2.0","error":{"message":"Odoo Server Error","data":{"message":"boom","debug":"TB"}}}', 200),
  { error: 'boom', traceback: 'TB', errorType: undefined });
assert.deepEqual(parseRpcResponse('{"name":"x","message":"denied","debug":"TB"}', 403), { error: 'denied', traceback: 'TB', errorType: 'x' });
assert.deepEqual(parseRpcResponse('<html>', 502), { error: 'HTTP 502' });

// the request as sent, for Edit & Resend
e = parseRpc(raw('https://x.com/web/dataset/call_kw/res.partner/read?x=1', { jsonrpc: '2.0', params: { model: 'res.partner', method: 'read', args: [[1]] } }));
assert.equal(e.route, '/web/dataset/call_kw/res.partner/read?x=1');
assert.equal(prettyJson(e.body), '{\n  "jsonrpc": "2.0",\n  "params": {\n    "model": "res.partner",\n    "method": "read",\n    "args": [\n      [\n        1\n      ]\n    ]\n  }\n}');
assert.equal(prettyJson('{"cut'), '{"cut'); // not JSON: as is

// Copy as cURL: call_kw → the external API (execute_kw, API key from the shell), other routes → the session cookie
const kwBody = JSON.stringify({ jsonrpc: '2.0', params: { model: 'res.partner', method: 'search_read', args: [[['name', '=', "O'Neil"]]], kwargs: { limit: 1 } } });
assert.equal(toCurl({ origin: 'https://x.com', route: '/web/dataset/call_kw/res.partner/search_read', body: kwBody, db: 'prod', uid: 2 }),
  "curl 'https://x.com/jsonrpc' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw " +
  `'{"jsonrpc":"2.0","method":"call","params":{"service":"object","method":"execute_kw","args":["prod",2,"'"$ODOO_API_KEY"'","res.partner","search_read",[[["name","=","O'\\''Neil"]]],{"limit":1}]}}'`);
assert.equal(toCurl({ origin: 'https://x.com', route: '/web/action/load', body: '{"params":{"action_id":5}}' }),
  "curl 'https://x.com/web/action/load' \\\n  -H 'Content-Type: application/json' \\\n  -b \"session_id=$ODOO_SESSION\" \\\n  --data-raw '{\"params\":{\"action_id\":5}}'");
