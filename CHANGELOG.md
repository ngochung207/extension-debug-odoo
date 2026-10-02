# Changelog

Each version's section is its release notes (.github/workflows/release.yml). Keep each bullet on one line: GitHub turns
every newline of the notes into a line break.

## [2.0.0]

The TypeScript rewrite of Odoo Debug, for Odoo 18.0 and 19.0: every difference between the two in one adapter, checked
against the database on each page.

- **Record**: every field of the record (definition, value by type, what recomputes it), quick filters, copy as JSON.
- **View**: the view told as a story: which views from which modules build it, in Odoo's order; one field through them; the combined arch.
- **RPC**: the page's JSON-RPC calls; edit and send again; a new request; Copy as cURL for the external API (18: /jsonrpc, 19: /json/2); ⏱ Profile a call (Perf).
- **Security**: rights as tables (ACLs and rules × operations, domains evaluated for the user); rights on every model; groups, what each grants, who has it; try a group; compare users.
- **Translations**: where a text comes from and where to change it; a record's and a view's translations; .po coverage, export, import; languages.
- **Apps**: modules as in Odoo's Apps menu; Activate / Upgrade / Open Forms; ⚠ code newer than the database; a module's description, manifest, dependencies both ways (what an install brings, auto-install included, as Odoo computes it) and as a diagram, its data and models; uninstall previewed by Odoo's wizard; operations left pending.
- **Menus**: the technical screens a developer opens all day (Models, Fields, Record Rules, Views, Crons, Actions, Parameters…), one click away without debug mode; opened in the Odoo page, ↗ in a new tab.
- **Perf**: Odoo's profiler read back: each request's SQL, the lines of code sending it, N+1 suspects, the slowest queries; a baseline to compare with; flame graph; clean up.
- **Code**: an ORM console as the logged-in user on the screen's record / records / model: JavaScript in the page (read-only, dry run, writes) or Python on the server (a dry run rolled back for real); results shown by type; snippets.
