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
