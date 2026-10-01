// Odoo 19.0. Every value checked against the 19.0 sources (odoo/orm/models.py, base/models/res_users.py,
// res_groups.py, ir_rule.py, ir_profile.py, addons/rpc); the comment says what changed since 18.0.
import type { OdooAdapter } from '../adapter.ts';

const READ = [
  'search', 'search_read', 'search_count', // search_fetch became @api.private
  'read', 'formatted_read_group', 'read_group', // formatted_read_group is new; read_group is @api.deprecated, still callable
  'web_search_read', 'web_read', 'web_read_group', 'read_progress_bar',
  'fields_get', 'name_search', 'default_get', 'get_views', 'get_view',
  'has_access', // check_access became @api.private
  'check_access_rights', 'check_access_rule', // @api.deprecated, still callable
  'exists', 'has_group', 'check_object_reference', 'get_metadata', 'export_data',
] as const;

const MODEL = [
  'search', 'search_read', 'search_count', 'formatted_read_group', 'read_group', 'web_search_read', 'web_read_group',
  'read_progress_bar', 'fields_get', 'name_search', 'name_create', 'default_get', 'get_views', 'get_view', 'create',
  'check_object_reference',
] as const;

export const v19: OdooAdapter = {
  major: 19,
  users: {
    allGroupsField: 'all_group_ids', // computed: group_ids + what they imply
    writeGroupsField: 'group_ids', // renamed from groups_id; holds the groups set directly
  },
  groups: {
    impliedField: 'all_implied_ids', // renamed from trans_implied_ids
    impliedIncludesSelf: true, // all_implied_ids = g.ids + its supersets
  },
  rules: { inheritsStoredOnly: true }, // _compute_domain skips a non-stored _inherits link
  profiler: { listFields: ['name', 'session', 'duration', 'cpu_duration', 'sql_count', 'create_date'] }, // cpu_duration is new
  api: { json2: true }, // /json/2/<model>/<method>, module rpc (auto_install)
  orm: { readMethods: READ, modelMethods: MODEL },
  expects: [
    { model: 'res.users', field: 'group_ids', usedBy: 'Security: groups' },
    { model: 'res.users', field: 'all_group_ids', usedBy: 'Security: groups' },
    { model: 'res.groups', field: 'all_implied_ids', usedBy: 'Security: implied groups' },
    { model: 'ir.profile', field: 'cpu_duration', usedBy: 'Perf' },
  ],
};
