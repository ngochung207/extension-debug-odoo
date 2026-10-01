// Security tab, view "System": the logged-in session (whoever is simulated above), Become Superuser, the system
// parameters (secrets masked), and a check of what the instance exposes on the web: HTTPS, the session cookie's flags,
// security headers, the database manager (read from its markup: the same in every language), list_db, the version.
// odoo.conf itself is never served over HTTP: it holds admin_passwd and db_password.
import { cookieFlags } from '../../extension/cookies.ts';
import { cached, uncache } from '../../extension/page-cache.ts';
import { exec, execOrThrow } from '../../extension/run-in-tab.ts';
import { _t } from '../../i18n/i18n.ts';
import { pageGo } from '../../injected/navigation.ts';
import { sessionInfo } from '../../odoo/reads.ts';
import { call } from '../../odoo/rpc.ts';
import { fill, filterBox } from '../../ui/cards.ts';
import { copyable, details, empty, kv, odooLink, pre } from '../../ui/components.ts';
import { expandable } from '../../ui/lists.ts';
import { frag } from '../../ui/parts.ts';
import { pageProbe } from './security.injected.ts';
import { checkInstance, managerState } from './security.logic.ts';
import type { SecurityCtx } from './security.state.ts';
import { box, button, findings, title, tpl } from './security.ui.ts';

const SECRET = /secret|passw|token|api_?key|private_?key/i; // a key-name heuristic: the value still shows when the row opens

export function systemView(body: HTMLElement, c: SecurityCtx) {
  body.append(
    section(_t('Session'), session),
    section(_t('System parameters (ir.config_parameter)'), () => params(c.page.origin)),
    section(_t('Instance check'), (again) => instanceCheck(c, again)),
  );
}

/** A titled section, built at once; `again` builds it anew. */
function section(name: string, build: (again: () => void) => Promise<Node>): Node {
  const content = box();
  const run = () => fill(content, () => build(run));
  run();
  return frag(title(name), content);
}

async function session(): Promise<Node> {
  const i = await sessionInfo();
  return frag(
    kv({
      user: `${i.name} (#${i.uid})`, login: i.username, db: i.db, version: i.server_version, admin: i.is_admin, system: i.is_system,
      'web.base.url': i['web.base.url'] || '—', test_mode: !!i.test_mode, // test_mode = odoo.conf test_enable
    }),
    details('user_context', pre(i.user_context)),
    details(_t('Companies'), pre(i.user_companies)),
    i.is_system && button(_t('Become Superuser'), () => {
      if (confirm(_t('Switch the current session to superuser (bypasses every rule)?'))) void exec(pageGo, '/web/become');
    }, 'btn', _t('Odoo\'s built-in /web/become route, base.group_system only')),
  );
}

/** base.group_system only: said instead of an AccessError. Not cached: edited while debugging. */
async function params(origin: string): Promise<Node> {
  if (!(await sessionInfo()).is_system) return empty(_t('Needs Settings rights (base.group_system).'));
  const rows = await call<{ id: number; key: string; value: string }[]>('ir.config_parameter', 'search_read', [[]], { fields: ['key', 'value'], order: 'key' });
  if (!rows.length) return empty(_t('No parameter.'));
  const { list } = tpl('list', { list: HTMLUListElement }).refs;
  const items = rows.map((pr) => {
    const r = tpl('param-row', { row: HTMLLIElement, key: HTMLSpanElement, link: HTMLSpanElement, value: HTMLDivElement }).refs;
    const secret = SECRET.test(pr.key);
    r.key.replaceWith(copyable(pr.key));
    r.link.replaceWith(odooLink(origin, `ir.config_parameter/${pr.id}`));
    if (pr.value) r.value.append(copyable(pr.value, '', secret ? '••••••' : pr.value)); // copies the real value, even masked
    r.row.dataset.q = `${pr.key} ${secret ? '' : pr.value}`.toLowerCase();
    list.append(expandable(r.row, () => pre(pr.value)));
    return r.row;
  });
  const { bar } = tpl('toolbar', { bar: HTMLDivElement }).refs;
  bar.append(filterBox(items, _t('Filter key / value')).input);
  return frag(bar, list);
}

async function instanceCheck(c: SecurityCtx, again: () => void): Promise<Node> {
  const [probe, cookie] = await cached('security probe', () => Promise.all([execOrThrow(pageProbe, 'Check failed'), cookieFlags(c.page.url)]));
  const checked = { ...probe, manager: probe.manager && managerState(probe.manager.status, probe.manager.html) };
  return frag(findings(checkInstance(checked, cookie ?? null)),
    details(_t('Raw data'), pre({ ...checked, manager: probe.manager && { ...checked.manager, html: `${probe.manager.html.length} chars` }, cookie })),
    button(_t('Check Again'), () => { uncache('security probe'); again(); }, 'chip'));
}
