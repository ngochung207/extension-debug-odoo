import assert from 'node:assert/strict';
import { planInstall, planUpgrade, stateKind, moduleFilter } from '../extension/src/features/apps/logic.js';

const rows = [
  { id: 1, name: 'sale', state: 'installed' }, { id: 2, name: 'stock', state: 'uninstalled' }, { id: 3, name: 'old', state: 'uninstallable' },
  { id: 4, name: 'mrp', state: 'to upgrade' }, { id: 5, name: 'crm', state: 'to install' }, { id: 6, name: 'gone', state: 'to remove' },
];
const ids = (list) => list.map((m) => m.id);

const i = planInstall(['stock', 'sale', 'nope', 'old', 'mrp', 'crm', 'gone'], rows);
assert.deepEqual(ids(i.install), [2, 5]);
assert.deepEqual(ids(i.installed), [1, 4]);
assert.deepEqual(ids(i.uninstallable), [3]);
assert.deepEqual(ids(i.busy), [6]);
assert.deepEqual(i.missing, ['nope']);

const u = planUpgrade(['sale', 'stock', 'mrp', 'nope'], rows);
assert.deepEqual(ids(u.upgrade), [1, 4]);
assert.deepEqual(ids(u.notInstalled), [2]);
assert.deepEqual(u.missing, ['nope']);

assert.equal(stateKind('installed'), 'ok');
assert.equal(stateKind('uninstallable'), 'err');
assert.equal(stateKind('uninstalled'), '');

// the Apps menu's filters: OR inside a group, AND between groups
{
  const mods = [
    { name: 'sale', state: 'installed', application: true, category_id: [1, 'Sales'] },
    { name: 'sale_crm', state: 'to upgrade', application: false, category_id: [1, 'Sales'] },
    { name: 'stock', state: 'uninstalled', application: true, category_id: [2, 'Inventory'] },
    { name: 'web_tour', state: 'uninstallable', application: false, category_id: false },
  ];
  const names = (f) => mods.filter(moduleFilter(f)).map((m) => m.name);
  assert.deepEqual(names({}), ['sale', 'sale_crm', 'stock', 'web_tour'], 'no filter');
  assert.deepEqual(names({ installed: true }), ['sale', 'sale_crm'], 'to upgrade counts as installed, like in Odoo');
  assert.deepEqual(names({ notInstalled: true }), ['stock', 'web_tour']);
  assert.deepEqual(names({ installed: true, notInstalled: true }), ['sale', 'sale_crm', 'stock', 'web_tour'], 'both: OR');
  assert.deepEqual(names({ apps: true }), ['sale', 'stock']);
  assert.deepEqual(names({ extra: true, installed: true }), ['sale_crm'], 'groups: AND');
  assert.deepEqual(names({ category: 'Sales' }), ['sale', 'sale_crm']);
}
