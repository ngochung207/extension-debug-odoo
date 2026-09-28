import assert from 'node:assert/strict';
import { parseRpc, parseRpcResponse } from '../extension/src/features/rpc/logic.js';

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
