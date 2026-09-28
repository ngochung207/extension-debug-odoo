import assert from 'node:assert/strict';
import { fmtValue, reverseDeps } from '../extension/src/features/record/logic.js';

assert.equal(fmtValue([7, 'Azure'], 'many2one'), 'Azure (#7)');
assert.equal(fmtValue(false, 'char'), '');
assert.equal(fmtValue(false, 'boolean'), 'false');
assert.equal(fmtValue([1, 2], 'one2many'), '[1, 2]');
assert.match(fmtValue([...Array(25).keys()], 'many2many'), /…\] \(25\)$/);

const deps = reverseDeps({
  qty: {}, price: {}, partner_id: {},
  subtotal: { depends: ['qty', 'price'] }, total: { depends: ['subtotal', 'partner_id.country_id'] }, self: { depends: ['self'] },
});
assert.deepEqual(deps.get('qty'), ['subtotal', 'total']);
assert.deepEqual(deps.get('partner_id'), ['total']);
assert.equal(deps.get('total'), undefined);
assert.equal(deps.get('self'), undefined);
