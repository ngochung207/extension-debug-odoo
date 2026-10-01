// Odoo 19.0. Every value checked against the 19.0 sources (odoo/orm/models.py, base/models/res_users.py,
// res_groups.py, ir_rule.py, ir_profile.py, addons/rpc); the comment says what changed since 18.0.
import type { MethodSignature, OdooAdapter } from '../adapter.ts';

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

/** The ORM / web methods the webclient calls with positional arguments, as defined in 19.0 (odoo/orm/models.py,
 * addons/web/models/models.py, base/models/ir_ui_view.py). Used when /doc/<model>.json can't be read. */
const SIGNATURES: Record<string, MethodSignature> = {
  read: { params: ['fields', 'load'], model: false },
  search_read: { params: ['domain', 'fields', 'offset', 'limit', 'order'], model: true },
  search: { params: ['domain', 'offset', 'limit', 'order'], model: true },
  search_count: { params: ['domain', 'limit'], model: true },
  write: { params: ['vals'], model: false },
  create: { params: ['vals_list'], model: true },
  unlink: { params: [], model: false },
  copy: { params: ['default'], model: false },
  name_search: { params: ['name', 'domain', 'operator', 'limit'], model: true },
  name_create: { params: ['name'], model: true },
  web_read: { params: ['specification'], model: false },
  web_search_read: { params: ['domain', 'specification', 'offset', 'limit', 'order', 'count_limit'], model: true },
  web_save: { params: ['vals', 'specification', 'next_id'], model: false },
  web_read_group: { params: ['domain', 'groupby', 'aggregates', 'limit', 'offset', 'order'], model: true },
  web_name_search: { params: ['name', 'specification', 'domain', 'operator', 'limit'], model: true },
  web_resequence: { params: ['specification', 'field_name', 'offset'], model: false },
  formatted_read_group: { params: ['domain', 'groupby', 'aggregates', 'having', 'offset', 'limit', 'order'], model: true },
  read_group: { params: ['domain', 'fields', 'groupby', 'offset', 'limit', 'orderby', 'lazy'], model: true },
  read_progress_bar: { params: ['domain', 'group_by', 'progress_bar'], model: true },
  onchange: { params: ['values', 'field_names', 'fields_spec'], model: false },
  fields_get: { params: ['allfields', 'attributes'], model: true },
  default_get: { params: ['fields'], model: true },
  get_views: { params: ['views', 'options'], model: true },
  exists: { params: [], model: false },
  has_access: { params: ['operation'], model: false },
  get_metadata: { params: [], model: false },
  export_data: { params: ['fields_to_export'], model: false },
  action_archive: { params: [], model: false },
  action_unarchive: { params: [], model: false },
};

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
  // /json/2/<model>/<method> (addons/rpc/controllers/json2.py, auto_install): binds NAMED arguments only
  // (signature.bind(records, **kwargs)), 422 when ids are given to an @api.model method. /jsonrpc still answers but is
  // deprecated, removed in Odoo 22 (documentation/19.0 external_api, "Migrating from XML-RPC / JSON-RPC").
  api: { kind: 'json2', signatures: SIGNATURES },
  orm: { readMethods: READ, modelMethods: MODEL },
  expects: [
    { model: 'res.users', field: 'group_ids', usedBy: 'Security: groups' },
    { model: 'res.users', field: 'all_group_ids', usedBy: 'Security: groups' },
    { model: 'res.groups', field: 'all_implied_ids', usedBy: 'Security: implied groups' },
    { model: 'ir.profile', field: 'cpu_duration', usedBy: 'Perf' },
  ],
};
