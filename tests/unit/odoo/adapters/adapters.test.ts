import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SUPPORTED } from '../../../../src/odoo/version.ts';
import { ADAPTERS, missingFields } from '../../../../src/odoo/detect.ts';

test('every supported major has its adapter, under its own number', () => {
  for (const major of SUPPORTED) assert.equal(ADAPTERS[major].major, major);
});

test('each adapter self-checks the fields it names', () => {
  for (const a of Object.values(ADAPTERS)) {
    const checked = new Set(a.expects.map((e) => `${e.model}.${e.field}`));
    for (const f of [`res.users.${a.users.allGroupsField}`, `res.users.${a.users.writeGroupsField}`, `res.groups.${a.groups.impliedField}`,
      `res.groups.${a.groups.appField}`]) {
      assert.ok(checked.has(f), `v${a.major} uses ${f} without checking it`);
    }
  }
});

test('ORM method lists: model-level reads are read methods; each version keeps only its public API', () => {
  for (const a of Object.values(ADAPTERS)) {
    const read = new Set(a.orm.readMethods);
    for (const m of a.orm.modelMethods) if (m !== 'create' && m !== 'name_create') assert.ok(read.has(m), `v${a.major}: ${m}`);
  }
  const { 18: v18, 19: v19 } = ADAPTERS;
  assert.ok(!v18.orm.readMethods.includes('formatted_read_group')); // added in 19
  assert.ok(v19.orm.readMethods.includes('formatted_read_group'));
  for (const m of ['search_fetch', 'check_access']) { // @api.private in 19
    assert.ok(v18.orm.readMethods.includes(m));
    assert.ok(!v19.orm.readMethods.includes(m));
  }
});

test('record rules: `time` only reaches the domains of 18', () => {
  assert.ok(ADAPTERS[18].rules.evalNames.includes('time'));
  assert.ok(!ADAPTERS[19].rules.evalNames.includes('time'));
});

test('the webclient translations route: a unique segment in 18, none in 19', () => {
  assert.ok(ADAPTERS[18].i18n.webTranslationsPath.includes('{unique}'));
  assert.equal(ADAPTERS[19].i18n.webTranslationsPath, '/web/webclient/translations');
});

test('self-check: missing fields', () => {
  const expects = ADAPTERS[19].expects;
  assert.deepEqual(missingFields(expects, Object.fromEntries(expects.map((e) => [e.model, expects.filter((x) => x.model === e.model).map((x) => x.field)]))), []);
  const missing = missingFields(expects, { 'res.users': ['group_ids', 'all_group_ids'], 'res.groups': ['all_implied_ids', 'privilege_id'] }); // ir.profile unreadable
  assert.deepEqual(missing.map((m) => `${m.model}.${m.field}`), ['ir.profile.cpu_duration']);
});
