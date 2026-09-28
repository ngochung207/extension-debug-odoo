import assert from 'node:assert/strict';
import { pickGroupField } from '../extension/src/shared/odoo.js';

assert.equal(pickGroupField({ group_ids: {}, all_group_ids: {} }), 'all_group_ids');
assert.equal(pickGroupField({ groups_id: {} }), 'groups_id');
assert.equal(pickGroupField({}), null);
