// Pure helpers, no chrome.* / DOM: tested by tests/apps.test.mjs.

/** Typed names + ir.module.module rows ({ id, name, state }) → what "Activate" does with each. */
export function planInstall(names, rows) {
  const byName = new Map(rows.map((m) => [m.name, m]));
  const plan = { install: [], installed: [], uninstallable: [], missing: [], busy: [] };
  for (const name of names) {
    const m = byName.get(name);
    if (!m) plan.missing.push(name);
    else if (m.state === 'uninstalled' || m.state === 'to install') plan.install.push(m);
    else if (m.state === 'installed' || m.state === 'to upgrade') plan.installed.push(m);
    else if (m.state === 'uninstallable') plan.uninstallable.push(m);
    else plan.busy.push(m); // to remove: a pending uninstall, left alone
  }
  return plan;
}

/** Typed names + rows → what "Upgrade" does with each: only installed modules can be upgraded. */
export function planUpgrade(names, rows) {
  const byName = new Map(rows.map((m) => [m.name, m]));
  const plan = { upgrade: [], notInstalled: [], missing: [] };
  for (const name of names) {
    const m = byName.get(name);
    if (!m) plan.missing.push(name);
    else if (m.state === 'installed' || m.state === 'to upgrade') plan.upgrade.push(m);
    else plan.notInstalled.push(m);
  }
  return plan;
}

/** ir.module.module state → pill kind. */
export const stateKind = (state) => ({ installed: 'ok', 'to upgrade': 'med', 'to install': 'med', 'to remove': 'med', uninstallable: 'err' })[state] || '';

/** Odoo's own "Installed" filter of the Apps menu (base/views/ir_module_views.xml); "Not Installed" is the rest. */
export const INSTALLED = ['installed', 'to upgrade', 'to remove'];

/** Odoo's Apps filters as a predicate on ir.module.module rows: in a group (Installed / Not Installed, Apps / Extra) the
 * ticked facets are OR'ed, none or both ticked is no filter; the groups and the category are AND'ed.
 * f: { installed, notInstalled, apps, extra, category (ir.module.category name: several share one) }. */
export function moduleFilter(f) {
  return (m) => {
    const installed = INSTALLED.includes(m.state);
    if (!!f.installed !== !!f.notInstalled && installed !== !!f.installed) return false;
    if (!!f.apps !== !!f.extra && !!m.application !== !!f.apps) return false;
    return !f.category || m.category_id?.[1] === f.category;
  };
}
