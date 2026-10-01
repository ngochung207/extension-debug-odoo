import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyValue, describeField, fmtValue, linkedRecord, matchesAll, recordJson, reverseDeps, type QuickFilter } from '../../../../src/features/record/record.logic.ts';
import type { FieldsGet } from '../../../../src/odoo/models.ts';

test('values as text', () => {
  assert.equal(fmtValue([7, 'Azure'], { type: 'many2one' }), 'Azure (#7)');
  assert.equal(fmtValue(false, { type: 'char' }), '');
  assert.equal(fmtValue(false, { type: 'boolean' }), 'false');
  assert.equal(fmtValue([1, 2], { type: 'many2many' }), '[1, 2]');
  assert.equal(fmtValue(Array.from({ length: 25 }, (_, i) => i), { type: 'one2many' }), '[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, …] (25)');
  assert.equal(fmtValue({ a: 1 }, { type: 'json' }), '{"a":1}');
  // selection: value and its label
  const state = { type: 'selection', selection: [['draft', 'Quotation'], ['sale', 'Sales Order']] as [string, string][] };
  assert.equal(fmtValue('draft', state), 'draft · Quotation');
  assert.equal(fmtValue('gone', state), 'gone'); // not in the list (anymore)
  assert.equal(fmtValue('x', { type: 'selection', selection: [['x', 'x']] }), 'x'); // label = value: once
});

test('values to copy', () => {
  assert.equal(copyValue('Azure'), 'Azure');
  assert.equal(copyValue([7, 'Azure']), '[\n  7,\n  "Azure"\n]');
  assert.equal(copyValue(false), 'false');
});

const fields: FieldsGet = {
  name: { string: 'Name', type: 'char', store: true, required: true },
  display_name: { string: 'Display Name', type: 'char', depends: ['name'] },
  label: { string: 'Label', type: 'char', depends: ['display_name'] },
  country_id: { string: 'Country', type: 'many2one', relation: 'res.country', store: true },
  country_code: { string: 'Code', type: 'char', related: 'country_id.code' },
  secret: { string: 'Secret', type: 'char', store: true, groups: 'base.group_system' },
  tag_ids: { string: 'Tags', type: 'many2many', relation: 'res.partner.category', store: true },
};

test('what a change recomputes: transitively, in the same model', () => {
  const r = reverseDeps(fields);
  assert.deepEqual(r.get('name'), ['display_name', 'label']);
  assert.deepEqual(r.get('display_name'), ['label']);
  assert.equal(r.get('country_id'), undefined); // related: not a depends
});

test('a field in one line', () => {
  assert.equal(describeField(fields.name!, { modules: 'base', index: true }, ['display_name']),
    'Name · stored · required · indexed · [base] · change → recomputes display_name');
  assert.equal(describeField(fields.country_code!, undefined, undefined), 'Code · non-stored · related country_id.code');
  assert.equal(describeField(fields.secret!, undefined, undefined), 'Secret · stored · groups base.group_system');
});

test('quick filters, combined', () => {
  const pick = (...on: QuickFilter[]) => Object.keys(fields).filter((n) => matchesAll(fields[n]!, new Set(on)));
  assert.deepEqual(pick('stored'), ['name', 'country_id', 'secret', 'tag_ids']);
  assert.deepEqual(pick('computed'), ['display_name', 'label', 'country_code']);
  assert.deepEqual(pick('relational'), ['country_id', 'tag_ids']);
  assert.deepEqual(pick('required'), ['name']);
  assert.deepEqual(pick('groups'), ['secret']);
  assert.deepEqual(pick('stored', 'relational'), ['country_id', 'tag_ids']);
  assert.deepEqual(pick(), Object.keys(fields)); // none: everything
});

test('the record a value opens', () => {
  assert.equal(linkedRecord(fields.country_id!, [233, 'Vietnam']), 'res.country/233');
  assert.equal(linkedRecord(fields.country_id!, false), null);
  assert.equal(linkedRecord(fields.tag_ids!, [1, 2]), null);
});

test('the record as JSON: values read, fields in order', () => {
  assert.equal(recordJson({ name: 'A', country_id: [1, 'X'], unknown: 1 }, fields), '{\n  "country_id": [\n    1,\n    "X"\n  ],\n  "name": "A"\n}');
});

test('groups of a field: parsed, then shown by group name', async () => {
  const { parseGroups, groupsLabel } = await import('../../../../src/features/record/record.logic.ts');
  assert.deepEqual(parseGroups('base.group_user, base.group_portal,!base.group_system'),
    [{ xmlid: 'base.group_user', not: false }, { xmlid: 'base.group_portal', not: false }, { xmlid: 'base.group_system', not: true }]);
  const names = new Map([['base.group_system', 'Administration / Settings'], ['base.group_portal', 'User types / Portal']]);
  assert.equal(groupsLabel('base.group_system', names), '🔒 Administration / Settings');
  assert.equal(groupsLabel('base.group_user,!base.group_portal', names), '🔒 base.group_user · not User types / Portal'); // unknown name: the xmlid
  assert.equal(groupsLabel('!base.group_portal', names), '🔒 not User types / Portal');
});
