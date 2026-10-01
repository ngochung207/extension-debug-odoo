// Security tab, view "Groups": a table of the groups under their application (18: the category, 19: the privilege),
// one column per user (● set on them, ◐ implied by another, + being tried, ○ not), how many models the group's own
// ACLs open, and the actions: Try (simulated in every view), Remove (a group set on the user). Only the users' groups
// show until the filter searches all of them. Below: the user's risks and, comparing, copying the other's groups.
// Writing groups needs Access Rights (base.group_erp_manager): asked to confirm, a refusal shows here.
import type { Json } from '../../contracts/json.ts';
import { _t } from '../../i18n/i18n.ts';
import { fill, filterBox } from '../../ui/cards.ts';
import { frag, note } from '../../ui/parts.ts';
import { groupGraph, writeGroups, type GroupGraph, type Simulated } from './security.data.ts';
import { byApp, copyGroups, directGroups, impliedBy, shortGroupName, userRisks, type AclRow } from './security.logic.ts';
import { afterWrite, stopTrying, tryGroup, type SecurityCtx } from './security.state.ts';
import { filterMatrix, matrix, type Cell, type MxRow } from '../../ui/matrix.ts';
import { box, button, errBoxTo, findings, mark, title, tpl } from './security.ui.ts';

export function groupsView(body: HTMLElement, c: SecurityCtx) {
  fill(body, async () => {
    const [sim, other, graph, acls] = await Promise.all([c.sim, c.other, groupGraph(c.a), c.allAcls()]);
    const out = box();
    const users = [sim, ...(other ? [other] : [])];
    const status = users.map((u) => statusOf(u, graph, c));
    const models = acls ? modelsPerGroup(acls) : null;

    const sections = byApp(graph.all).map(({ app, groups }) => ({
      title: app || _t('Other'),
      folded: !groups.some((g) => users.some((u) => u.groupIds.has(g.id))),
      rows: groups.map((g): MxRow => ({
        label: [shortGroupName(g)],
        q: g.full_name,
        tags: users.some((u) => u.groupIds.has(g.id)) ? ['held'] : [],
        kind: sim.groupIds.has(g.id) ? undefined : 'off',
        cells: [...status.map((s) => s(g.id)), models ? String(models.get(g.id) ?? 0) : '', action(sim, g.id, graph, c, out)],
      })),
    }));
    const table = matrix(_t('Group'), [...users.map((u) => u.user.name), _t('Models'), ''], sections);
    const { bar } = tpl('toolbar', { bar: HTMLDivElement }).refs;
    const { text: count } = tpl('count', { text: HTMLSpanElement }).refs;
    const f = filterBox([], _t('Filter or try a group…'));
    const apply = () => {
      const searching = !!f.input.value.trim();
      const n = filterMatrix(table, f.input.value, (r) => searching || r.dataset.tags === 'held');
      count.textContent = searching ? _t('%s groups found', n) : _t('%s groups', n);
    };
    f.input.addEventListener('input', apply);
    bar.append(f.input, count);
    apply();
    const legend = note(_t('● set on the user · ◐ implied by another group · + being tried · ○ not. Models: how many models the group\'s own ACLs open. Type to find a group the users don\'t have.'));
    legend.classList.add('legend');
    return frag(bar, table, legend, out, title(_t('Risks of %s', sim.user.name)), findings(userRisks(sim.user, sim.has)), other && copyActions(sim, other, graph, c, out));
  });
}

const directOf = (u: Simulated, graph: GroupGraph, c: SecurityCtx) =>
  (c.a.users.writeGroupsField !== c.a.users.allGroupsField ? new Set(u.user.write) : directGroups(u.real, (id) => graph.implied(id)));

/** A user's relation to each group: set on them, implied, tried, or not. */
function statusOf(u: Simulated, graph: GroupGraph, c: SecurityCtx): (id: number) => Cell {
  const direct = directOf(u, graph, c);
  const by = impliedBy(u.groupIds, (id) => graph.implied(id));
  return (id) => {
    if (u.tried.has(id)) return mark('tried', _t('Being tried'));
    if (u.real.has(id) && direct.has(id) && !by.has(id)) return mark('has', _t('Set on %s', u.user.name));
    if (u.groupIds.has(id)) return mark('implied', _t('Implied by %s', (by.get(id) ?? []).map((h) => graph.name(h)).join(', ')));
    return mark('no');
  };
}

function action(sim: Simulated, id: number, graph: GroupGraph, c: SecurityCtx, out: HTMLElement): Cell {
  if (sim.tried.has(id)) return button('×', () => stopTrying(c, id), 'chip', _t('Stop trying it'));
  if (sim.real.has(id)) {
    const removable = directOf(sim, graph, c).has(id) && !impliedBy(sim.real, (g) => graph.implied(g)).has(id);
    return removable ? button(_t('Remove'), () => {
      if (confirm(_t('Remove %s from %s?', graph.name(id), sim.user.name))) write(c, out, sim.user.id, [[3, id]]);
    }, 'chip') : '';
  }
  if (sim.groupIds.has(id)) return '';
  return button(_t('Try'), () => void tryGroup(c, id), 'chip', _t('Simulate this group in every view, nothing is written'));
}

/** The models each group's own ACLs grant something on. */
function modelsPerGroup(rows: readonly AclRow[]): Map<number, number> {
  const sets = new Map<number, Set<number>>();
  for (const r of rows) {
    if (!r.group_id || !r.model_id || !(r.perm_read || r.perm_write || r.perm_create || r.perm_unlink)) continue;
    sets.set(r.group_id[0], (sets.get(r.group_id[0]) ?? new Set()).add(r.model_id[0]));
  }
  return new Map([...sets].map(([g, s]) => [g, s.size]));
}

/** Writes the user's groups (asked to confirm before); a refusal (Access Rights needed) shows in `out`. */
const write = (c: SecurityCtx, out: HTMLElement, uid: number, commands: Json[]) =>
  afterWrite(c, uid, () => writeGroups(uid, commands, c.a)).catch((e: unknown) => errBoxTo(out, e));

/** Copying the compared user's groups onto this one: the missing ones only, or exactly theirs. */
function copyActions(sim: Simulated, other: Simulated, graph: GroupGraph, c: SecurityCtx, out: HTMLElement): Node | null {
  const buttons = (['add', 'same'] as const).flatMap((how) => {
    const plan = copyGroups(sim.user.write, other.user.write, how);
    if (!plan.adds.length && !plan.removes.length) return [];
    return [button(how === 'add' ? _t('Give %s the groups of %s they lack (%s)', sim.user.name, other.user.name, plan.adds.length)
      : _t('Make the groups of %s the same as %s', sim.user.name, other.user.name), () => {
      const lines = [
        plan.adds.length > 0 && _t('Add: %s', plan.adds.map((g) => graph.name(g)).join(', ')),
        plan.removes.length > 0 && _t('Remove: %s', plan.removes.map((g) => graph.name(g)).join(', ')),
        sim.user.share !== other.user.share && _t('Warning: one is a portal user, the other is not: the user type changes.'),
      ].filter(Boolean).join('\n');
      if (confirm(`${_t('Change the groups of %s?', sim.user.name)}\n\n${lines}`)) write(c, out, sim.user.id, plan.commands);
    })];
  });
  if (!buttons.length) return null;
  const row = box(...buttons);
  row.className = 'row';
  return frag(title(_t('Copy the groups of %s', other.user.name)), row);
}
