// Odoo 18.0. Every value checked against the 18.0 sources (odoo/models.py, base/models/res_users.py, ir_rule.py,
// ir_profile.py); the comment says where when it differs from 19.0.
import type { OdooAdapter } from '../adapter.ts';

const READ = [
  'search', 'search_read', 'search_count', 'search_fetch', // search_fetch: public in 18 (@api.private in 19)
  'read', 'read_group', 'web_search_read', 'web_read', 'web_read_group', 'read_progress_bar',
  'fields_get', 'name_search', 'default_get', 'get_views', 'get_view',
  'has_access', 'check_access', // check_access: public in 18 (@api.private in 19)
  'check_access_rights', 'check_access_rule', 'exists', 'has_group', 'check_object_reference', 'get_metadata', 'export_data',
] as const;

const MODEL = [
  'search', 'search_read', 'search_count', 'search_fetch', 'read_group', 'web_search_read', 'web_read_group',
  'read_progress_bar', 'fields_get', 'name_search', 'name_create', 'default_get', 'get_views', 'get_view', 'create',
  'check_object_reference',
] as const;

export const v18: OdooAdapter = {
  major: 18,
  users: {
    allGroupsField: 'groups_id', // stores the implied groups too (written by _apply_implied)
    writeGroupsField: 'groups_id',
  },
  groups: {
    impliedField: 'trans_implied_ids',
    impliedIncludesSelf: false, // trans_implied_ids = implied_ids | implied_ids.trans_implied_ids
    appField: 'category_id', // full_name = '<category> / <name>' (ir.module.category)
  },
  rules: {
    inheritsStoredOnly: false, // every _inherits parent's rules apply
    evalNames: ['user', 'time', 'company_ids', 'company_id'],
  },
  i18n: { webTranslationsPath: '/web/webclient/translations/{unique}' }, // web/controllers/webclient.py: a mandatory unique segment
  profiler: { listFields: ['name', 'session', 'duration', 'sql_count', 'create_date'] }, // no cpu_duration before 19
  // /jsonrpc (base/controllers/rpc.py) → service/model.py execute_kw; the API key replaces the password
  // (documentation/18.0 external_api: "simply replace your password by the key"). No /json/2 in 18.
  api: { kind: 'jsonrpc' },
  orm: { readMethods: READ, modelMethods: MODEL },
  expects: [
    { model: 'res.users', field: 'groups_id', usedBy: 'Security: groups' },
    { model: 'res.groups', field: 'trans_implied_ids', usedBy: 'Security: implied groups' },
    { model: 'res.groups', field: 'category_id', usedBy: 'Security: groups by application' },
    { model: 'ir.profile', field: 'sql_count', usedBy: 'Perf' },
  ],
};
