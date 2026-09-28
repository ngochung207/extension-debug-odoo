// Pure Odoo helpers shared by several features, including the version differences (see README "Odoo versions").

export const MODES = ['read', 'write', 'create', 'unlink'];

/** res.users group field: renamed in Odoo 19 (groups_id → group_ids / all_group_ids). */
export function pickGroupField(fields) {
  return ['all_group_ids', 'groups_id', 'group_ids'].find((f) => f in fields) || null;
}
