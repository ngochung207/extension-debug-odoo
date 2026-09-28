import assert from 'node:assert/strict';
import { sqlSummary, appFrame } from '../extension/src/features/perf/logic.js';

const sq = sqlSummary([{ query: 'A', time: 1 }, { query: 'B', time: 5 }, { query: 'A', time: 2 }]);
assert.equal(sq.count, 3); assert.equal(sq.time, 8);
assert.deepEqual(sq.dups.map((g) => [g.query, g.count, g.time]), [['A', 2, 3]]);
assert.deepEqual(sq.slow.map((e) => e.time), [5, 2, 1]);

assert.deepEqual(appFrame([['/srv/odoo/addons/sale/models/sale_order.py', 9, 'f', ''], ['/srv/odoo/odoo/orm/models.py', 1, 'read', '']]),
  ['/srv/odoo/addons/sale/models/sale_order.py', 9, 'f', '']);
assert.equal(appFrame([]), null);
